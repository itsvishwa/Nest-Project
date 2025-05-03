import * as sharp from 'sharp';

export async function convertToGreyscale(
  imagePath: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const greyscaleBuffer = Buffer.alloc(info.width * info.height); // Allocate buffer for greyscale image

  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3]; // Red channel
    const g = data[i * 3 + 1]; // Green channel
    const b = data[i * 3 + 2]; // Blue channel

    // Apply the greyscale formula
    const grey = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    // Assign the greyscale value to the buffer
    greyscaleBuffer[i] = grey;
  }

  return {
    buffer: greyscaleBuffer,
    width: info.width,
    height: info.height,
  };
}
