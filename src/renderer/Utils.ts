
import {IImagePaletteInfo} from "../image/Types";

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
 * It takes a range of key values and a range of normalized [0,1] values and returns a map of key
 * values to RGB values
 * @param {number} nEntries - how many distinct entries we have in the map
 * @param {number} keyStart - the first key value into the map
 * @param {number} keyEnd - the maximum value of the data you want to map to the color map
 * @param {number} valueStart - the normalized [0,1] start value into the rainbow range
 * @param {number} valueEnd - the upper limit of the colors range
 * @returns A map of colors.
 */
export function  makeRainbowColormap (
    nEntries: number, //how many distinct entries we have in the map
    keyStart: number,// first key value into the map
    keyEnd: number,  // last key value into the map
    valueStart: number,// a normalized [0,1] start value into the rainbow range
    valueEnd: number  // a normalized [0,1] end value into the rainbow range
    ): ColorMap{

    let colorMap: ColorMap = new Map();
    const clamp = (num: number, min: number, max: number) => 
        Math.min(Math.max(num, min), max);

    valueStart       = clamp(valueStart, 0.0, 1.0);
    valueEnd         = clamp(valueEnd,   0.0, 1.0);
    
    const lColor = Math.round(valueStart*255); // the lower limit of the colors range
    const uColor = Math.round(valueEnd*255);   // the upper limit of the colors range
    const range  =  uColor-lColor;             // the number of distinct colors
    let color_value: number;

    const keyIncrement = (keyEnd-keyStart)/(nEntries-1);
    let   keyCurrent = keyStart;

    for(let i:number =0; i < nEntries; i++)    {
        // if the numEntries < range, the colors must be evenly choosen along the range
        color_value = lColor+Math.round(i/(nEntries-1)*range);
        let rgb: DataView = hsl_to_rgb(color_value, 255, 128);
        colorMap.set(keyCurrent, [rgb.getUint8(0),rgb.getUint8(1),rgb.getUint8(2)]);
        keyCurrent += keyIncrement;
    }

    return colorMap;
}

/**
 * It creates a color map that maps a range of numbers to a range of colors
 * @param {number} coldThreshold - The value below which the color will be blue.
 * @param {number} hotThreshold - The value at which the color map will be fully red.
 * @returns A map of colors.
 */
export function makeHotColdColorMap(coldThreshold: number, hotThreshold: number) {
    let colorMap: ColorMap = new Map();

    const minThreshold = 0;
    colorMap.set(minThreshold, [0,0,255]);
    colorMap.set(coldThreshold, [0,0,0]);
    colorMap.set(hotThreshold, [255,0,0]);

    return colorMap;
}

export function makeRangeColorMap(keyStart: number, keyEnd: number, outRangeCol: [number,number,number]) {
    const nEntries = 16;
    const keyIncrement = (keyEnd-keyStart)/(nEntries-1);
    const outsideRangeKey = keyStart + (keyIncrement*nEntries);

    let colorMap: ColorMap = makeRainbowColormap(nEntries, keyStart, keyEnd, 0.7, 0);

    // if (keyStart !== 0) {
        colorMap.set(-1, outRangeCol);
    // }
    
    colorMap.set(outsideRangeKey, outRangeCol);

    return colorMap;
}

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
    return {
        nEntries,
        firstValue:0,
        bitsAllocated:8,
        r: reds,
        g: greens,
        b: blues
    } as IImagePaletteInfo;

}