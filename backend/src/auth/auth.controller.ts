import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { CurrentUser, Public, Roles } from './auth.guard.js';
import type { AuthUser } from './auth.guard.js';
import {
  hashPassword,
  passwordChangedNow,
  verifyPassword,
} from './password.js';

// Pembatas tebak password. Dihitung di database supaya tetap berlaku di serverless (penghitung
// di memori hilang tiap instance) dan per alamat IP, supaya orang lain yang salah password
// berkali-kali tidak ikut mengunci pemilik akun yang masuk dari perangkatnya sendiri.
// ponytail: tanpa pembatas di tepi jaringan, banjir percobaan tetap menambah baris selama
// jendela waktu. Pasang rate limit di gateway/CDN bila itu terjadi.
const WINDOW_MINUTES = 15;
const MAX_PER_IP = 5; // per username dari satu alamat IP
const MAX_PER_USERNAME = 20; // per username dari semua alamat: menahan tebakan tersebar

class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword: string;
}

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const username = dto.username.trim().toLowerCase();
    await this.assertNotLocked(username, ip);

    const user = await this.prisma.user.findUnique({ where: { username } });
    const ok =
      !!user?.active && (await verifyPassword(dto.password, user.passwordHash));
    if (!user || !ok) {
      await this.recordFailure(username, ip);
      throw new UnauthorizedException('Username atau password salah');
    }
    await this.prisma.loginAttempt.deleteMany({ where: { username, ip } });
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        buyerId: user.buyerId,
      },
    };
  }

  /** Ganti password sendiri. Semua sesi lama akun ini putus; perangkat ini menerima token baru. */
  @ApiBearerAuth()
  @Roles(...Object.values(Role))
  @Post('password')
  @HttpCode(200)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    // Token curian tidak boleh dipakai menebak password lama tanpa batas.
    await this.assertNotLocked(user.username, ip);
    const { passwordHash } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    if (!(await verifyPassword(dto.currentPassword, passwordHash))) {
      await this.recordFailure(user.username, ip);
      // 400, bukan 401: aplikasi menganggap 401 sebagai sesi habis dan mengeluarkan pengguna.
      throw new BadRequestException('Password saat ini salah');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        passwordChangedAt: passwordChangedNow(),
      },
    });
    return { accessToken: await this.jwt.signAsync({ sub: user.id }) };
  }

  @ApiBearerAuth()
  @Roles(...Object.values(Role))
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Tolak (429) bila percobaan gagal dalam jendela waktu sudah mencapai batas. */
  private async assertNotLocked(username: string, ip: string) {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    const recent = (where: { ip?: string }, take: number) =>
      this.prisma.loginAttempt.findMany({
        where: { username, ...where, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take,
        select: { createdAt: true },
      });
    const [fromIp, fromAnywhere] = await Promise.all([
      recent({ ip }, MAX_PER_IP),
      recent({}, MAX_PER_USERNAME),
    ]);
    // Terkunci sampai percobaan tertua di dalam batas keluar dari jendela waktu.
    const oldest =
      fromIp.length >= MAX_PER_IP
        ? fromIp[MAX_PER_IP - 1]
        : fromAnywhere.length >= MAX_PER_USERNAME
          ? fromAnywhere[MAX_PER_USERNAME - 1]
          : null;
    if (oldest) {
      const minutes = Math.ceil(
        (oldest.createdAt.getTime() - since.getTime()) / 60_000,
      );
      throw new HttpException(
        `Terlalu banyak percobaan masuk. Coba lagi dalam ${minutes} menit.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailure(username: string, ip: string) {
    const expired = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: expired } },
    });
    await this.prisma.loginAttempt.create({ data: { username, ip } });
  }
}
