import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './auth/auth.guard.js';
import { StatusResponseDto } from './common/dto/status-response.dto.js';

@ApiTags('Core')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Endpoint utama backend dengan status dan tautan dokumentasi' })
  @ApiResponse({
    status: 200,
    description: 'Pesan selamat datang dan navigasi API dalam format JSON',
  })
  getRoot() {
    return this.appService.getRoot();
  }

  @Get('api')
  @ApiOperation({ summary: 'Informasi gateway API dan daftar rute endpoint yang tersedia' })
  @ApiResponse({
    status: 200,
    description: 'Peta rute API dan tautan dokumentasi Swagger dalam format JSON',
  })
  getApiInfo() {
    return this.appService.getApiInfo();
  }

  @Get('api/status')
  @ApiOperation({ summary: 'Health check dan status service backend' })
  @ApiResponse({
    status: 200,
    description: 'Status service backend berhasil diperoleh',
    type: StatusResponseDto,
  })
  getStatus(): StatusResponseDto {
    return this.appService.getStatus();
  }
}
