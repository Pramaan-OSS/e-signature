import sharp from 'sharp';

export const TARGET_SIZE = 1000;

type ResizeDocumentImageOptions = {
  image: Buffer;
  size?: number;
};

/**
 * Resize image to 1000x1000 using fill strategy.
 * Scales to cover the target area and crops any overflow.
 */
export const resizeDocumentImage = async ({ image, size = TARGET_SIZE }: ResizeDocumentImageOptions) => {
  return await sharp(image).resize(size, size, { fit: 'fill' }).toBuffer();
};
