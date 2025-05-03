import { Injectable, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { convertToGreyscale } from '../../../common/utils/greyscale';

@Injectable()
export class HarrisSharpService {
  private readonly logger = new Logger(HarrisSharpService.name);

  @MessagePattern({ cmd: 'harris_corner' })
  async detectCorners(
    @Payload()
    data: {
      imagePath: string;
      k?: number; // Harris free parameter (default 0.04)
      windowSize?: number; // Gaussian window size (default 3)
      thresh?: number; // Response threshold (default 1e-5)
    },
  ) {
    const { imagePath, k = 0.04, windowSize = 3, thresh = 1e-5 } = data;
    if (!fs.existsSync(imagePath)) {
      return { error: 'Image not found', statusCode: 404 };
    }

    // Convert to greyscale
    const { buffer: gray, width, height } = await convertToGreyscale(imagePath);

    // Sobel kernels
    const Sx = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ];
    const Sy = [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1],
    ];

    // Convolution function
    const convolve = (input: Buffer, kernel: number[][]): Float32Array => {
      const output = new Float32Array(width * height);
      const kSize = kernel.length;
      const kHalf = Math.floor(kSize / 2);

      for (let y = kHalf; y < height - kHalf; y++) {
        for (let x = kHalf; x < width - kHalf; x++) {
          let sum = 0;
          for (let ky = -kHalf; ky <= kHalf; ky++) {
            for (let kx = -kHalf; kx <= kHalf; kx++) {
              const pixel = gray[(y + ky) * width + (x + kx)];
              sum += pixel * kernel[ky + kHalf][kx + kHalf];
            }
          }
          output[y * width + x] = sum;
        }
      }
      return output;
    };

    // Compute gradients
    const Ix = convolve(gray, Sx);
    const Iy = convolve(gray, Sy);

    // Compute products of derivatives
    const Ixx = Ix.map((v) => v * v);
    const Iyy = Iy.map((v) => v * v);
    const Ixy = Ix.map((v, i) => v * Iy[i]);

    // Apply Gaussian blur to the products
    const applyGaussianBlur = (input: Float32Array): Float32Array => {
      const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1],
      ].map((row) => row.map((v) => v / 16));
      return convolve(Buffer.from(input.buffer), kernel);
    };

    const Sxx = applyGaussianBlur(Ixx);
    const Syy = applyGaussianBlur(Iyy);
    const Sxy = applyGaussianBlur(Ixy);

    // Compute Harris response
    const R = new Float32Array(width * height);
    for (let i = 0; i < R.length; i++) {
      const det = Sxx[i] * Syy[i] - Sxy[i] * Sxy[i];
      const trace = Sxx[i] + Syy[i];
      R[i] = det - k * trace * trace;
    }

    // Threshold and non-maximum suppression
    const corners: { x: number; y: number; r: number }[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (
          R[idx] > thresh &&
          R[idx] > R[idx - 1] &&
          R[idx] > R[idx + 1] &&
          R[idx] > R[idx - width] &&
          R[idx] > R[idx + width]
        ) {
          corners.push({ x, y, r: R[idx] });
        }
      }
    }

    // Draw corners on the image
    const outputBuffer = Buffer.from(gray);
    corners.forEach(({ x, y }) => {
      const idx = y * width + x;
      outputBuffer[idx] = 255; // Highlight corner in white
    });

    const outputDir = path.join(
      process.cwd(),
      'apps/feature-detection/output_images',
    );
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(
      outputDir,
      `harris_corners_${path.basename(imagePath)}`,
    );
    await sharp(outputBuffer, { raw: { width, height, channels: 1 } })
      .png()
      .toFile(outputPath);

    this.logger.log(
      `Detected ${corners.length} corners, saved to ${outputPath}`,
    );
    return { corners: corners.slice(0, 20), outputPath };
  }
}
