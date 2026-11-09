export const brandAssets={
 logo:'/brand/supplied-v1/clean/logo.png',
 wordmark:'/brand/supplied-v1/clean/wordmark.png',
 lockup:'/brand/supplied-v1/clean/lockup.png',
} as const;
export type BrandVariant=keyof typeof brandAssets;
export function brandArtwork(variant:BrandVariant='lockup'){
 const frame=document.createElement('span');frame.className='brand-art brand-'+variant;
 frame.textContent='Celadon Lowpoly';return frame;
}
