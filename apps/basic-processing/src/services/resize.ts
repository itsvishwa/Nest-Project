/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { MessagePattern } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ResizeService {
  @MessagePattern({ cmd: 'resize_image' })
  async resize(data: { imagePath: string; width: number; height: number }) {
    try {
      const { imagePath, width, height } = data;

      if (!fs.existsSync(imagePath)) {
        throw new Error('File does not exist');
      }

      const outputDir = path.join(
        process.cwd(),
        'apps/basic-processing/output_images',
      );
      const outputFileName = 'resized_image.png';
      const outputFilePath = path.join(outputDir, outputFileName);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const inputImage = await fs.promises.readFile(imagePath);
      const { data: inputBuffer, info: inputInfo } = await sharp(inputImage)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Fixed the parameter order - inputWidth and inputHeight were swapped
      const resizedBuffer = this.bilinearInterpolation(
        inputBuffer,
        inputInfo.width,
        inputInfo.height,
        width,
        height,
        inputInfo.channels,
      );

      // Save the resized image
      await sharp(resizedBuffer, {
        raw: {
          width: width,
          height: height,
          channels: inputInfo.channels,
        },
      })
        .png()
        .toFile(outputFilePath);

      return {
        success: true,
        message: 'Image resized successfully',
        savedImagePath: outputFilePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private bilinearInterpolation(
    inputBuffer: Buffer,
    inputWidth: number,
    inputHeight: number,
    outputWidth: number,
    outputHeight: number,
    channels: number,
  ): Buffer {
    const outputBuffer = Buffer.alloc(outputWidth * outputHeight * channels);

    const xRatio = inputWidth / outputWidth;
    const yRatio = inputHeight / outputHeight;

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        // Get the source position
        const srcX = x * xRatio;
        const srcY = y * yRatio;

        // Get the floor values for x and y
        const x1 = Math.floor(srcX);
        const y1 = Math.floor(srcY);

        // Get the ceiling values for x and y (clamped to image bounds)
        const x2 = Math.min(Math.ceil(srcX), inputWidth - 1);
        const y2 = Math.min(Math.ceil(srcY), inputHeight - 1);

        // Calculate fractional parts
        const xWeight = srcX - x1;
        const yWeight = srcY - y1;

        for (let c = 0; c < channels; c++) {
          // Get the four neighboring pixels
          const p1 = inputBuffer[(y1 * inputWidth + x1) * channels + c];
          const p2 = inputBuffer[(y1 * inputWidth + x2) * channels + c];
          const p3 = inputBuffer[(y2 * inputWidth + x1) * channels + c];
          const p4 = inputBuffer[(y2 * inputWidth + x2) * channels + c];

          // Interpolate in x direction
          const top = p1 * (1 - xWeight) + p2 * xWeight;
          const bottom = p3 * (1 - xWeight) + p4 * xWeight;

          // Interpolate in y direction
          const pixel = Math.round(top * (1 - yWeight) + bottom * yWeight);

          // Set the output pixel
          outputBuffer[(y * outputWidth + x) * channels + c] = pixel;
        }
      }
    }

    return outputBuffer;
  }
}
