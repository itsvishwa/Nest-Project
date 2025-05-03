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

      const resizedBuffer = this.bilinearInterpolation(
        inputBuffer,
        inputInfo.height,
        inputInfo.width,
        height,
        width,
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
  ): Buffer {
    const outputBuffer = Buffer.alloc(outputWidth * outputHeight * 3); // Assuming 3 channels (RGB)

    for (let y = 0; y < outputHeight; y++) {
      for (let x = 0; x < outputWidth; x++) {
        // Map output pixel (x, y) to input pixel space
        const srcX = (x / outputWidth) * inputWidth;
        const srcY = (y / outputHeight) * inputHeight;

        // Get the integer and fractional parts of the source coordinates
        const x0 = Math.floor(srcX);
        const x1 = Math.min(x0 + 1, inputWidth - 1);
        const y0 = Math.floor(srcY);
        const y1 = Math.min(y0 + 1, inputHeight - 1);

        const xWeight = srcX - x0;
        const yWeight = srcY - y0;

        for (let c = 0; c < 3; c++) {
          // Loop through RGB channels
          const topLeft = inputBuffer[(y0 * inputWidth + x0) * 3 + c];
          const topRight = inputBuffer[(y0 * inputWidth + x1) * 3 + c];
          const bottomLeft = inputBuffer[(y1 * inputWidth + x0) * 3 + c];
          const bottomRight = inputBuffer[(y1 * inputWidth + x1) * 3 + c];

          // Perform bilinear interpolation
          const top = topLeft * (1 - xWeight) + topRight * xWeight;
          const bottom = bottomLeft * (1 - xWeight) + bottomRight * xWeight;
          const value = top * (1 - yWeight) + bottom * yWeight;

          // Assign the interpolated value to the output buffer
          outputBuffer[(y * outputWidth + x) * 3 + c] = Math.round(value);
        }
      }
    }

    return outputBuffer;
  }
}
