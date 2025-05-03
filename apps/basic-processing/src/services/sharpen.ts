import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { MessagePattern } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SharpenService {
  @MessagePattern({ cmd: 'sharpen_image' })
  async sharpenImage(data: { imagePath: string }) {
    try {
      const { imagePath } = data;

      if (!fs.existsSync(imagePath)) {
        throw new Error('File does not exist');
      }

      const outputDir = path.join(
        process.cwd(),
        'apps/basic-processing/output_images',
      );
      const outputFileName = `sharpened_image.png`;
      const outputFilePath = path.join(outputDir, outputFileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await sharp(imagePath).sharpen().toFile(outputFilePath);

      return {
        success: true,
        message: 'Image sharpened successfully',
        savedImagePath: outputFilePath,
      };
    } catch (error) {
      console.error('Sharpening error:', error);
      return {
        success: false,
        message: 'Failed to sharpen image',
        error: error.message,
      };
    }
  }
}
