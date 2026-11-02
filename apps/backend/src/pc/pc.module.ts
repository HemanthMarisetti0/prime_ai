import { Module } from '@nestjs/common';
import { PcController } from './pc.controller';
import { VolumeService } from './volume.service';

@Module({
  controllers: [PcController],
  providers: [VolumeService],
  exports: [VolumeService],
})
export class PcModule {}
