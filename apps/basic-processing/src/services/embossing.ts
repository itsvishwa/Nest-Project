import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { MessagePattern } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmbossingService {
  @MessagePattern({ cmd: 'emboss_image' })
  async embossImage(data: { imagePath: string }) {
    try {
      const { imagePath } = data;

      if (!fs.existsSync(imagePath)) {
        throw new Error('File does not exist');
      }

      const outputDir = path.join(
        process.cwd(),
        'apps/basic-processing/output_images',
      );
      const outputFileName = `embossed_image.png`;
      const outputFilePath = path.join(outputDir, outputFileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const embossKernel = [
        [-1, -1, 0],
        [-1, 0, 1],
        [0, 1, 1],
      ];

      await sharp(imagePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: embossKernel.flat(),
        })
        .modulate({ brightness: 1.5 }) // Adding brightness to create a grey-toned background
        .toFile(outputFilePath);

      return {
        success: true,
        message: 'Image embossed successfully',
        savedImagePath: outputFilePath,
      };
    } catch (error) {
      console.error('Embossing error:', error);
      return {
        success: false,
        message: 'Failed to emboss image',
        error: error.message,
      };
    }
  }
}
