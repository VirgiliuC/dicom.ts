
import {IImagePaletteInfo, IDisplayInfo} from "../image/Types";

/**
 * "Given a hue, saturation and luminance, return a DataView containing the RGB values."
 * 
 * The function is written in TypeScript, but it's easy to convert to JavaScript
 * @param {number} hue - 0-255
 * @param {number} sat - saturation, 0-255
 * @param {number} luminance - 0-255
 * @returns A DataView object.
 */
export function  hsl_to_rgb(
    hue: number,
    sat: number,
    luminance: number):DataView {

    let color = new DataView(new ArrayBuffer(3));
    const seg: number   = 85; /* 255/3 */
    let fhue: number    = 0;
    let offset: number[]=[seg,0,2*seg];
    let pos: number;
    let amplitude: number = Math.min((255-luminance),luminance);

    for( let c:number = 0; c < 3; c++){
        pos=(hue+offset[c])%255;

        switch(Math.floor(pos/seg))
        {
        case 0:  fhue=Math.min(4.0/seg*(pos%seg), 2.0)-1;      break;
        case 1:  fhue=Math.min(4.0-4.0/seg*(pos%seg), 2.0)-1.0;  break;
        case 2:  fhue=-1.0; break;
        }
        color.setUint8(c, Math.round(luminance + (amplitude*sat/255.0)*fhue));
    }
    return color;
}

/**
 * It takes a number of entries, a start and end value, and an alpha value, and returns a palette
 * object.
 * @param {number} nEntries - the number of entries in the palette
 * @param {number} start - the normalized [0,1] start value into the rainbow range
 * @param {number} end - the end of the rainbow range, a normalized [0,1] value
 * @param {number} alpha - the transparency of the palette.
 * @returns An object with the following properties:
 */
export function  makeRainbowPallette (nEntries: number,
    start: number,// a normalized [0,1] start value into the rainbow range
    end: number,  // a normalized [0,1] end value into the rainbow range
    alpha: number): IImagePaletteInfo{

    const reds      =  new DataView(new ArrayBuffer(nEntries));
	const greens    =  new DataView(new ArrayBuffer(nEntries));
	const blues     =  new DataView(new ArrayBuffer(nEntries));

    const clamp = (num: number, min: number, max: number) => 
        Math.min(Math.max(num, min), max);

    start       = clamp(start, 0.0, 1.0);
    end         = clamp(end,   0.0, 1.0);
    alpha       = clamp(alpha, 0.0, 1.0);
    
    const lColor = Math.round(start*255); // the lower limit of the colors range
    const uColor = Math.round(end*255);   // the upper limit of the colors range
    const range  =  uColor-lColor;             // the number of distinct colors
    let color_value: number;

    for(let i:number =0; i < nEntries; i++)    {
        // if the numEntries < range, the colors must be evenly choosen along the range
        color_value = lColor+Math.round(i/(nEntries-1)*range);
        let rgb: DataView = hsl_to_rgb(color_value, 255, 128);
        reds.setUint8(i, rgb.getUint8(0));
        greens.setUint8(i, rgb.getUint8(1));
        blues.setUint8(i, rgb.getUint8(2));
    }

    return {
        nEntries,
        firstValue:0,
        bitsAllocated: 8,
        r: reds,
        g: greens,
        b: blues
    } as IImagePaletteInfo;
}
export type ColorMap = Map<number, [number,number,number]>;

/**
 * It takes a map of pixel values and colors, and returns a palette with the given number of entries,
 * where each entry is a color, and the colors are distributed according to the pixel values in the map
 * @param {ColorMap} colorMap - a map of pixel values to RGB values, e.g. {1000: [0,255,0], 2000:
 * [255,0,0]}
 * @param {number} nEntries - number of entries in the palette
 * @param {number} pixelBitsAllocated - the number of bits used to store each pixel value.
 * @returns an object with the following properties:
 */
export function makeColorPalletteFromMap(
    colorMap: ColorMap,
    nEntries:number,
    pixelBitsAllocated:number): IImagePaletteInfo {

    /* sorting the map against the ascending dose values*/
    const pixvalColors: ColorMap = new Map([...colorMap].sort((a, b) => a[0] - b[0]));
    /*how many distinct pixel value levels are captured per palette entry*/   
    const paletteWidthRatio: number = 2**pixelBitsAllocated/nEntries; 
    const reds      =  new DataView(new ArrayBuffer(nEntries));
	const greens    =  new DataView(new ArrayBuffer(nEntries));
	const blues     =  new DataView(new ArrayBuffer(nEntries));
    /* we need to distribute colors in the pallette acording to the pixvalColors entry points, 
       populating the given color above each entry point, as requested (i.e., if green is 
       given for pixval 1000 and red for 2000,we put green on [1000-2000) band as 'above',
       and red on the next interval, [2000, next)
    */
   console.log("colorMap: ", [...colorMap]);
    console.log("pixvalColors: ", [...pixvalColors]);
   let color = [0,0,0];
   let i:number = 0;
    for (const [pixval, rgb] of pixvalColors) {
        for(; (i*paletteWidthRatio) < pixval && i < nEntries; i++){
            reds.setUint8(i, color[0]);
            greens.setUint8(i, color[1]);
            blues.setUint8(i, color[2]);
        }
        color = rgb; 
    }
    /*let's finish off with the last color, above last entry up to the end/top*/
    for(; i < nEntries; i++){
        reds.setUint8(i, color[0]);
        greens.setUint8(i, color[1]);
        blues.setUint8(i, color[2]);
    }
    console.log("reds: ", reds);
    return {
        nEntries,
        firstValue:0,
        bitsAllocated:8,
        r: reds,
        g: greens,
        b: blues
    } as IImagePaletteInfo;

}