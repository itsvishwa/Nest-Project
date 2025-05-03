import { Injectable, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';

@Injectable()
export class FloodFillService {
  private readonly logger = new Logger(FloodFillService.name);

  @MessagePattern({ cmd: 'flood_fill' })
  async floodFill(
    @Payload()
    data: {
      imagePath: string;
      sr: number;
      sc: number;
      newColor: [number, number, number];
      tolerance?: number; // Do not change the tolerance value(It is defined as 0 in the below code)
    },
  ) {
    const { imagePath, sr, sc, newColor, tolerance = 0 } = data;

    if (!fs.existsSync(imagePath)) {
      this.logger.error(`Image not found at path: ${imagePath}`);
      throw new Error('Image file not found');
    }

    const outputDir = path.join(
      process.cwd(),
      'apps/enhancement/output_images',
    );
    const outputFileName = `flood_filled_${path.basename(imagePath)}`;
    const outputPath = path.join(outputDir, outputFileName);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      if (!width || !height) {
        throw new Error('Could not determine image dimensions');
      }

      const { data: rawBuffer, info } = await sharp(imageBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { channels } = info;

      const outputBuffer = Buffer.from(rawBuffer);

      const getIndex = (x: number, y: number) => (y * width + x) * channels;

      const getColor = (buffer: Buffer, x: number, y: number): number[] => {
        const i = getIndex(x, y);
        return Array.from(buffer.slice(i, i + channels)); // Ensure it returns an array of numbers
      };

      const setColor = (
        buffer: Buffer,
        x: number,
        y: number,
        color: number[],
      ) => {
        const i = getIndex(x, y);
        for (let c = 0; c < channels; c++) {
          buffer[i + c] = color[c] || 0;
        }
      };

      const isWithinTolerance = (a: number[], b: number[]): boolean => {
        return (
          a.length === b.length &&
          a.every((val, idx) => Math.abs(val - b[idx]) <= tolerance)
        );
      };

      if (sc < 0 || sc >= width || sr < 0 || sr >= height) {
        throw new Error(
          `Starting coordinates (${sc},${sr}) out of image bounds (${width}x${height})`,
        );
      }

      const originalColor = getColor(rawBuffer, sc, sr);
      const newColorArray = newColor.slice(0, channels);

      if (isWithinTolerance(originalColor, newColorArray) && tolerance === 0) {
        return {
          message: 'Original and new color are the same. Nothing changed.',
          outputPath,
        };
      }

      const queue: [number, number][] = [[sc, sr]];
      const visited = new Set<string>();

      const dx = [1, -1, 0, 0];
      const dy = [0, 0, 1, -1];

      let pixelsFilled = 0;
      while (queue.length > 0) {
        const [x, y] = queue.shift()!;
        const key = `${x},${y}`;

        if (visited.has(key)) continue;
        visited.add(key);

        const currentColor = getColor(outputBuffer, x, y);
        if (!isWithinTolerance(currentColor, originalColor)) continue;

        setColor(outputBuffer, x, y, newColorArray);
        pixelsFilled++;

        for (let i = 0; i < 4; i++) {
          const nx = x + dx[i];
          const ny = y + dy[i];

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            queue.push([nx, ny]);
          }
        }
      }

      await sharp(outputBuffer, {
        raw: { width, height, channels },
      }).toFile(outputPath);

      return {
        message: `Flood fill applied successfully. ${pixelsFilled} pixels changed.`,
        outputPath,
        pixelsFilled,
      };
    } catch (error) {
      this.logger.error(`Error applying flood fill: ${error.message}`);
      throw error;
    }
  }
}
