import { Module } from '@nestjs/common';
import { PcController } from './pc.controller';
import { PcService } from './pc.service';
import { VolumeService } from './volume.service';

@Module({
  controllers: [PcController],
  providers: [VolumeService, PcService],
  exports: [VolumeService, PcService],
})
export class PcModule {}
