import { Prisma } from '../generated/prisma/client.js';

/**
 * Jalankan `create` paling banyak sekali per kunci. Kirim ulang (antrean offline, retry
 * jaringan) mengembalikan hasil yang sudah ada. `find` mencari lewat kolom unik kuncinya.
 */
export async function idempotent<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  try {
    return await create();
  } catch (err) {
    // Dua kiriman dengan kunci sama tiba bersamaan: yang kalah mengambil hasil yang menang.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const winner = await find();
      if (winner) return winner;
    }
    throw err;
  }
}
