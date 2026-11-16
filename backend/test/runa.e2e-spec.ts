import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/auth/password.js';
import { PrismaService } from './../src/prisma.service.js';

// Alur inti RUNA: login & role, pengumpulan idempotent, stok dari ledger,
// timbangan IoT, penjualan, permintaan marketplace, pilot plastik, laporan.
describe('RUNA core flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  let pointId: string;
  let plastikId: string;
  let buyerId: string;

  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ Authorization: `Bearer ${token[role]}` });
  const stockOf = async (categoryId: string) => {
    const res = await http().get('/api/inventory').set(as('pengurus')).expect(200);
    return Number(res.body.find((c: any) => c.id === categoryId).stockKg);
  };
  const collect = (weightKg: number, key: string = randomUUID(), extra = {}) =>
    http()
      .post('/api/collections')
      .set(as('petugas'))
      .set('Idempotency-Key', key)
      .send({
        collectionPointId: pointId,
        wasteCategoryId: plastikId,
        weightKg,
        recordedAt: new Date().toISOString(),
        ...extra,
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Seperti di Vercel: alamat pengunjung dibaca dari X-Forwarded-For.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
    prisma = app.get(PrismaService);

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
    );

    pointId = (await prisma.collectionPoint.create({ data: { name: 'Titik 1' } })).id;
    plastikId = (
      await prisma.wasteCategory.create({ data: { name: 'Plastik', listed: true } })
    ).id;
    buyerId = (await prisma.buyer.create({ data: { name: 'Pengepul A' } })).id;

    const passwordHash = await hashPassword('rahasia-tes-123');
    for (const [username, role] of [
      ['pengurus', 'PENGURUS'],
      ['petugas', 'PETUGAS'],
      ['mitra', 'MITRA'],
    ] as const) {
      await prisma.user.create({
        data: {
          name: username,
          username,
          role,
          passwordHash,
          buyerId: role === 'MITRA' ? buyerId : null,
        },
      });
      const res = await http()
        .post('/api/auth/login')
        .send({ username, password: 'rahasia-tes-123' })
        .expect(200);
      token[username] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('menolak password salah dan request tanpa login', async () => {
    await http()
      .post('/api/auth/login')
      .send({ username: 'pengurus', password: 'salah' })
      .expect(401);
    await http().get('/api/collections').expect(401);
  });

  it('membatasi tebak password per alamat IP, bukan per akun', async () => {
    await prisma.user.create({
      data: {
        name: 'kunci',
        username: 'kunci',
        role: 'PETUGAS',
        passwordHash: await hashPassword('rahasia-tes-123'),
      },
    });
    const login = (password: string, ip: string) =>
      http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ username: 'kunci', password });
    const attacker = '203.0.113.9';

    for (let i = 0; i < 5; i++) await login('salah', attacker).expect(401);
    // Alamat penebak terkunci: password yang benar pun ditolak dari sana...
    await login('rahasia-tes-123', attacker).expect(429);
    // ...tetapi pemilik akun, dari alamat lain, tetap bisa masuk.
    await login('rahasia-tes-123', '198.51.100.7').expect(200);

    // Setelah jendela 15 menit lewat, alamat itu boleh mencoba lagi dan hitungannya bersih.
    await prisma.loginAttempt.updateMany({
      where: { username: 'kunci' },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    await login('rahasia-tes-123', attacker).expect(200);
    expect(
      await prisma.loginAttempt.count({ where: { username: 'kunci', ip: attacker } }),
    ).toBe(0);
  });

  it('ganti password memutus sesi lama dan memberi token baru', async () => {
    await prisma.user.create({
      data: {
        name: 'ganti',
        username: 'ganti',
        role: 'PETUGAS',
        passwordHash: await hashPassword('password-lama-1'),
      },
    });
    const login = (password: string) =>
      http().post('/api/auth/login').send({ username: 'ganti', password });
    const me = (token: string) =>
      http().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const change = (token: string, currentPassword: string) =>
      http()
        .post('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword, newPassword: 'password-baru-2' });
    const old = (await login('password-lama-1').expect(200)).body.accessToken;

    // Password lama salah: 400 (bukan 401), dan sesi tetap berlaku.
    await change(old, 'bukan-ini').expect(400);
    await me(old).expect(200);

    // Klaim iat JWT berpresisi detik: tunggu pergantian detik agar token lama pasti lebih tua.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const fresh = (await change(old, 'password-lama-1').expect(200)).body.accessToken;
    await me(old).expect(401);
    await me(fresh).expect(200);
    await login('password-lama-1').expect(401);
    await login('password-baru-2').expect(200);
  });

  it('membatasi akses sesuai role', async () => {
    await http()
      .post('/api/sales')
      .set(as('petugas'))
      .send({ buyerId, wasteCategoryId: plastikId, weightKg: 1, pricePerKg: 1 })
      .expect(403);
    await http().get('/api/collections').set(as('mitra')).expect(403);
    await http().get('/api/marketplace/listings').set(as('mitra')).expect(200);
  });

  it('menolak input pengumpulan yang tidak valid', async () => {
    await collect(-5).expect(400);
    await collect(5, 'bukan-uuid').expect(400);
  });

  it('pengumpulan menambah stok, dan kirim ulang tidak menggandakan', async () => {
    const key = randomUUID();
    const first = await collect(12.5, key).expect(201);
    const retry = await collect(12.5, key).expect(201);

    expect(retry.body.id).toBe(first.body.id);
    expect(await stockOf(plastikId)).toBe(12.5);
    expect(await prisma.collectionTransaction.count()).toBe(1);
  });

  it('berat dari timbangan IoT dipakai sekali dan menjadi berat resmi', async () => {
    const reading = { deviceId: 'RUNA-SCALE-001', weightKg: 7.25 };
    await http()
      .post('/api/weighing')
      .set('X-Device-Key', 'kunci-salah')
      .send(reading)
      .expect(401);
    const weighing = await http()
      .post('/api/weighing')
      .set('X-Device-Key', 'e2e-only-device-key')
      .send(reading)
      .expect(201);

    // Klien mengirim 999, tetapi yang tercatat adalah berat dari timbangan.
    const tx = await collect(999, randomUUID(), {
      weighingRecordId: weighing.body.id,
    }).expect(201);
    expect(Number(tx.body.weightKg)).toBe(7.25);
    expect(await stockOf(plastikId)).toBe(19.75);

    await collect(1, randomUUID(), { weighingRecordId: weighing.body.id }).expect(409);
    const pending = await http().get('/api/weighing').set(as('petugas')).expect(200);
    expect(pending.body).toHaveLength(0);
  });

  it('penjualan mengurangi stok dan ditolak bila melebihi saldo', async () => {
    const sale = { buyerId, wasteCategoryId: plastikId, pricePerKg: 2500 };
    await http()
      .post('/api/sales')
      .set(as('pengurus'))
      .send({ ...sale, weightKg: 100 })
      .expect(409);

    const ok = await http()
      .post('/api/sales')
      .set(as('pengurus'))
      .send({ ...sale, weightKg: 9.75 })
      .expect(201);
    expect(Number(ok.body.totalAmount)).toBe(24375);
    expect(await stockOf(plastikId)).toBe(10);
  });

  it('permintaan marketplace: mitra meminta, pengurus menyetujui dan menyelesaikan', async () => {
    const created = await http()
      .post('/api/marketplace/requests')
      .set(as('mitra'))
      .send({ wasteCategoryId: plastikId, quantityKg: 4 })
      .expect(201);
    expect(created.body.buyerId).toBe(buyerId);

    // Belum disetujui: belum boleh diselesaikan.
    const complete = () =>
      http()
        .post('/api/sales')
        .set(as('pengurus'))
        .send({ requestId: created.body.id, weightKg: 4, pricePerKg: 3000 });
    await complete().expect(409);

    await http()
      .patch(`/api/marketplace/requests/${created.body.id}`)
      .set(as('pengurus'))
      .send({ status: 'APPROVED' })
      .expect(200);
    await complete().expect(201);

    const list = await http()
      .get('/api/marketplace/requests')
      .set(as('mitra'))
      .expect(200);
    expect(list.body[0].status).toBe('COMPLETED');
    expect(await stockOf(plastikId)).toBe(6);
  });

  it('eksperimen plastik mengeluarkan stok sebagai pengolahan', async () => {
    await http()
      .post('/api/plastic/experiments')
      .set(as('pengurus'))
      .send({
        code: 'PB-001',
        wasteCategoryId: plastikId,
        plasticWeightKg: 2,
        prototypeCount: 3,
        conductedAt: new Date().toISOString(),
      })
      .expect(201);
    expect(await stockOf(plastikId)).toBe(4);
  });

  it('batch BSF: pakan keluar dari stok organik, panen masuk stok produk dan bisa dijual', async () => {
    const organikId = (
      await prisma.wasteCategory.create({ data: { name: 'Organik', group: 'ORGANIK' } })
    ).id;
    const maggotId = (
      await prisma.wasteCategory.create({
        data: { name: 'Maggot BSF', group: 'PRODUK', listed: true },
      })
    ).id;
    await collect(20, randomUUID(), { wasteCategoryId: organikId }).expect(201);

    const batch = await http()
      .post('/api/organic/batches')
      .set(as('petugas'))
      .send({ code: 'BSF-001', startedAt: new Date().toISOString() })
      .expect(201);
    const record = (body: object, key?: string) =>
      http()
        .post(`/api/organic/batches/${batch.body.id}/records`)
        .set({ ...as('petugas'), ...(key && { 'Idempotency-Key': key }) })
        .send({ recordedAt: new Date().toISOString(), ...body });

    // Tanpa kategori stok: hanya dicatat, seperti semula.
    await record({ type: 'FEEDING', weightKg: 10 }).expect(201);
    await record({ type: 'HARVEST', weightKg: 1.5 }).expect(201);
    await record({ type: 'HARVEST' }).expect(400); // panen tanpa berat

    // Pakan dari stok organik mengurangi stok, dan ditolak bila melebihi saldo.
    await record({ type: 'FEEDING', weightKg: 8, wasteCategoryId: organikId }).expect(201);
    expect(await stockOf(organikId)).toBe(12);
    await record({ type: 'FEEDING', weightKg: 50, wasteCategoryId: organikId }).expect(409);
    // Hasil panen tidak boleh masuk ke kategori sampah.
    await record({ type: 'HARVEST', weightKg: 1, wasteCategoryId: organikId }).expect(400);

    // Panen masuk stok produk; kirim ulang dari antrean offline tidak menggandakan.
    const key = randomUUID();
    const harvest = { type: 'HARVEST', weightKg: 2.5, wasteCategoryId: maggotId };
    const first = await record(harvest, key).expect(201);
    const retry = await record(harvest, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await stockOf(maggotId)).toBe(2.5);

    // Produk olahan tampil di katalog marketplace dan bisa dijual.
    const listings = await http()
      .get('/api/marketplace/listings')
      .set(as('mitra'))
      .expect(200);
    expect(listings.body.find((l: any) => l.id === maggotId).group).toBe('PRODUK');
    await http()
      .post('/api/sales')
      .set(as('pengurus'))
      .send({ buyerId, wasteCategoryId: maggotId, weightKg: 1, pricePerKg: 8000 })
      .expect(201);
    expect(await stockOf(maggotId)).toBe(1.5);
  });

  it('laporan dan dashboard merangkum seluruh alur', async () => {
    const report = await http().get('/api/reports').set(as('pengurus')).expect(200);
    expect(Number(report.body.collected.totalKg)).toBe(39.75);
    expect(report.body.collected.count).toBe(3);
    expect(Number(report.body.sold.totalKg)).toBe(14.75);
    expect(Number(report.body.sold.totalAmount)).toBe(44375);
    expect(Number(report.body.plastic.processedKg)).toBe(2);
    expect(report.body.plastic.prototypes).toBe(3);
    expect(Number(report.body.organic.feedingKg)).toBe(18);
    expect(Number(report.body.organic.feedingFromStockKg)).toBe(8); // 10 kg sisanya dari mitra
    expect(Number(report.body.organic.harvestKg)).toBe(4);
    expect(report.body.previous).toBeNull(); // tanpa rentang tidak ada pembanding

    const dashboard = await http().get('/api/dashboard').set(as('pengurus')).expect(200);
    expect(dashboard.body.trend).toHaveLength(1);
    expect(dashboard.body.trend[0].weightKg).toBe(39.75);
    expect(dashboard.body.stock).toHaveLength(3);
    // Perjalanan material tanpa stok produk: terkumpul 39,75 = terjual + diolah + masih di stok.
    const { soldKg, processedKg, stockKg } = dashboard.body.flow;
    expect([soldKg, processedKg, stockKg].map(Number)).toEqual([13.75, 10, 16]);
  });

  it('laporan: pembanding periode sebelumnya, tren bulanan, dan batas baris ekspor', async () => {
    // Rentang satu hari mulai sejam lagi: kosong, dan periode sebelumnya memuat semua data tes.
    const from = Date.now() + 3_600_000;
    const range = {
      from: new Date(from).toISOString(),
      to: new Date(from + 86_400_000).toISOString(),
    };
    const ranged = await http()
      .get('/api/reports')
      .query(range)
      .set(as('pengurus'))
      .expect(200);
    expect(Number(ranged.body.collected.totalKg)).toBe(0);
    expect(Number(ranged.body.previous.collectedKg)).toBe(39.75);
    expect(Number(ranged.body.previous.soldAmount)).toBe(44375);

    const analytics = await http()
      .get('/api/reports/analytics')
      .set(as('pengurus'))
      .expect(200);
    expect(analytics.body.months).toHaveLength(6);
    expect(analytics.body.collectedKg.at(-1)).toBe(39.75);
    expect(analytics.body.byPoint[0].monthlyKg.at(-1)).toBe(39.75);
    expect(analytics.body.byCategory).toHaveLength(2); // Plastik dan Organik
    expect(analytics.body.sales.at(-1)).toEqual({ weightKg: 14.75, amount: 44375 });

    const collections = (query: object) =>
      http().get('/api/collections').query(query).set(as('petugas'));
    expect((await collections({ limit: 1 }).expect(200)).body).toHaveLength(1);
    await collections({ limit: 99999 }).expect(400);
    const sales = await http()
      .get('/api/sales')
      .query({ from: range.from })
      .set(as('pengurus'))
      .expect(200);
    expect(sales.body).toHaveLength(0);
  });

  it('tabungan nasabah: setoran ber-KK menambah saldo, penarikan dibatasi saldo', async () => {
    const householdId = (
      await prisma.household.create({ data: { name: 'Bu Siti', rt: '01', rw: '03' } })
    ).id;
    const setPrice = (householdPricePerKg: number) =>
      http()
        .patch(`/api/categories/${plastikId}`)
        .set(as('pengurus'))
        .send({ householdPricePerKg })
        .expect(200);
    await setPrice(2000);

    // Kirim ulang setoran yang sama tidak menggandakan tabungan.
    const key = randomUUID();
    await collect(2.5, key, { householdId }).expect(201);
    await collect(2.5, key, { householdId }).expect(201);
    const balance = async () => {
      const res = await http().get('/api/savings').set(as('petugas')).expect(200);
      return Number(res.body.find((h: any) => h.id === householdId).balance);
    };
    expect(await balance()).toBe(5000);

    // Harga berubah kemudian: setoran lama tetap memakai harga saat disimpan.
    await setPrice(4000);
    expect(await balance()).toBe(5000);

    const withdraw = (role: string, amount: number) =>
      http()
        .post(`/api/savings/${householdId}/withdrawals`)
        .set(as(role))
        .send({ amount, note: 'tunai' });
    await withdraw('petugas', 1000).expect(403);
    await withdraw('pengurus', 6000).expect(409);
    await withdraw('pengurus', 3000).expect(201);
    expect(await balance()).toBe(2000);

    const history = await http()
      .get(`/api/savings/${householdId}`)
      .set(as('pengurus'))
      .expect(200);
    expect(Number(history.body.balance)).toBe(2000);
    expect(history.body.deposits).toHaveLength(1);
    expect(history.body.withdrawals).toHaveLength(1);
  });

  it('laporan partisipasi menghitung KK yang setor', async () => {
    await prisma.household.create({ data: { name: 'Pak Ujang' } }); // terdaftar, belum setor
    const report = await http().get('/api/reports').set(as('pengurus')).expect(200);
    const { registered, depositing, byHousehold } = report.body.participation;
    expect([registered, depositing]).toEqual([2, 1]);
    expect(byHousehold[0].name).toBe('Bu Siti');
    expect(Number(byHousehold[0].weightKg)).toBe(2.5);
    expect(Number(byHousehold[0].creditAmount)).toBe(5000);
  });

  it('batch kompos: tanpa residu, panen kompos masuk stok produk dan terpisah di laporan', async () => {
    const komposId = (
      await prisma.wasteCategory.create({
        data: { name: 'Kompos', group: 'PRODUK', listed: true },
      })
    ).id;
    const batch = await http()
      .post('/api/organic/batches')
      .set(as('petugas'))
      .send({ code: 'KMP-001', method: 'KOMPOS', startedAt: new Date().toISOString() })
      .expect(201);
    expect(batch.body.method).toBe('KOMPOS');
    const record = (body: object) =>
      http()
        .post(`/api/organic/batches/${batch.body.id}/records`)
        .set(as('petugas'))
        .send({ recordedAt: new Date().toISOString(), ...body });

    await record({ type: 'FRASS', weightKg: 1 }).expect(400);
    await record({ type: 'HARVEST', weightKg: 3, wasteCategoryId: komposId }).expect(201);
    expect(await stockOf(komposId)).toBe(3);

    const report = await http().get('/api/reports').set(as('pengurus')).expect(200);
    expect(Number(report.body.organic.compostKg)).toBe(3);
    expect(Number(report.body.organic.harvestKg)).toBe(4); // panen larva BSF tidak berubah
  });

  it('mencatat perubahan data ke audit log', async () => {
    const logs = await prisma.auditLog.count({
      where: { method: 'POST', path: '/api/collections', statusCode: 201 },
    });
    expect(logs).toBeGreaterThanOrEqual(2);
  });
});
