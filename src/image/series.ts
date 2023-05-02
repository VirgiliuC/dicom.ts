import * as twgl from "twgl.js";
import OrderedMap from "../parser/orderedmap";
import DCMImage from "../parser/image";
import { SliceDirection } from "../parser/constants";
import FrameInfo from "./FrameInfo";
// eslint-disable-next-line import/no-cycle
import { decoderForImage } from "../decoder";
import { DecoderInfo } from "./DecoderInfo";
import { displayInfoFromDecoderInfo } from "./DisplayInfo";
// import { verify } from "crypto";

type Images = DCMImage[];
//--------------------------------------------------------
/**
 * It takes a bunch of parameters and returns a number
 * @param {number} mosaicCols - number of columns in the mosaic
 * @param {number} mosaicColWidth - The width of each column in the mosaic.
 * @param {number} mosaicRowHeight - The height of each row in the mosaic.
 * @param {number} mosaicWidth - The width of the mosaic image in pixels.
 * @param {number} xLocVal - The x location of the pixel in the mosaic
 * @param {number} yLocVal - The y location of the pixel in the mosaic.
 * @param {number} zLocVal - The index of the image in the mosaic.
 * @returns The offset of the pixel in the mosaic image.
 */
const getMosaicOffset = (
	mosaicCols: number,
	mosaicColWidth: number,
	mosaicRowHeight: number,
	mosaicWidth: number,
	xLocVal: number,
	yLocVal:number,
	zLocVal:number
):number => {
	let xLoc = xLocVal;
	let yLoc = yLocVal;
	const zLoc = zLocVal;

	xLoc = ((zLoc % mosaicCols) * mosaicColWidth) + xLoc;
	yLoc = (((Math.floor(zLoc / mosaicCols)) * mosaicRowHeight) + yLoc) * mosaicWidth;

	return (xLoc + yLoc);
};
//--------------------------------------------------------
/**
 * It takes an array of DICOM images and a slice direction (0, 1, or 2) and returns an array of DICOM
 * images ordered by the slice direction
 * @param {Images} images - Images - this is the array of images that you want to sort
 * @param {number} sliceDir - 0 = axial, 1 = sagittal, 2 = coronal
 * @returns An array of images sorted by the slice direction.
 */
const orderByImagePosition = (images: Images, sliceDir: number): Images => {
	const dicomMap = new OrderedMap<number, any>();
	for (let ctr = 0; ctr < images.length; ctr += 1) {
		dicomMap.put(images[ctr].getImagePositionSliceDir(sliceDir), images[ctr]);
	}
	return dicomMap.getOrderedValues();
};

//--------------------------------------------------------
/**
 * "Given an array of images, return an array of images ordered by slice location."
 * 
 * The first thing we do is create a new OrderedMap. This is a data structure that allows us to store
 * key-value pairs, and then retrieve the values in the order that they were inserted
 * @param {Images} images - Images - this is the array of images that you want to sort.
 * @returns An array of DCMImage objects.
 */
const orderBySliceLocation = (images: Images): Images => {
	const dicomMap = new OrderedMap<number, DCMImage>();
	for (let ctr = 0; ctr < images.length; ctr += 1) {
		dicomMap.put(images[ctr].sliceLocation, images[ctr]);
	}
	return dicomMap.getOrderedValues();
};

//--------------------------------------------------------
/**
 * It takes an array of images, creates a map of image numbers to images, and then returns the values
 * of the map in order
 * @param {Images} images - Images - this is the array of images that you want to sort.
 * @returns An array of DCMImage objects.
 */
const orderByImageNumber = (images: Images): Images => {
	const dicomMap = new OrderedMap<number, DCMImage>();
	for (let ctr = 0; ctr < images.length; ctr += 1) {
		dicomMap.put(images[ctr].imageNumber, images[ctr]);
	}
	return dicomMap.getOrderedValues();
};

//--------------------------------------------------------
/**
 * It checks to see if the image number, image position, or slice location of the image matches any of
 * the images in the data group
 * @param {Images} dg - Images - the images that have already been loaded
 * @param {DCMImage} image - The image to check for a matching slice
 * @param {number} sliceDir - The direction of the slice.  This is the direction that the slice is
 * moving in.  For example, if the slice is moving in the X direction, then the sliceDir is 0.  If the
 * slice is moving in the Y direction, then the sliceDir is 1.  If the
 * @param {boolean} doImagePos - If true, then the image position will be used to determine if the
 * image is a duplicate.
 * @param {boolean} doSliceLoc - boolean - If true, then the slice location will be used to determine
 * if the image is a duplicate.
 * @returns A boolean value.
 */
const hasMatchingSlice = (
	dg: Images,
	image: DCMImage,
	sliceDir: number,
	doImagePos: boolean,
	doSliceLoc: boolean
): boolean => {
	let matchingNum = 0;

	if (doImagePos) {
		matchingNum = image.getImagePositionSliceDir(sliceDir);
	}
	else if (doSliceLoc) {
		matchingNum = image.sliceLocation;
	}
	else {
		matchingNum = image.imageNumber;
	}

	for (let ctr = 0; ctr < dg.length; ctr += 1) {
		const current = dg[ctr];

		if (doImagePos) {
			const imagePos = current.getImagePositionSliceDir(sliceDir);
			if (imagePos === matchingNum) {
				return true;
			}
		}
		else if (doSliceLoc) {
			const sliceLoc = current.sliceLocation;
			if (sliceLoc === matchingNum) {
				return true;
			}
		}
		else {
			const imageNum = current.imageNumber;
			if (imageNum === matchingNum) {
				return true;
			}
		}
	}

	return false;
};

//--------------------------------------------------------
/**
 * It takes a list of images and returns a map of images, where the keys are the timepoints and the
 * values are the images at that timepoint
 * @param {Images} images - Images - the array of images to sort
 * @param {number} numFrames - the number of frames in the series
 * @param {number} sliceDir - The direction of the slice.
 * @param {boolean} hasImagePosition - boolean
 * @param {boolean} hasSliceLocation - boolean
 * @returns An ordered map of images.
 */
const orderByTime = (
	images: Images,
	numFrames:number,
	sliceDir: number,
	hasImagePosition: boolean,
	hasSliceLocation: boolean
): OrderedMap<number, Images> => {
	const dicomMap = new OrderedMap<number, Images>();
	const hasTemporalPosition = (numFrames > 1) && (images[0].temporalPosition !== null);
	const hasTemporalNumber = (numFrames > 1)
					&& (images[0].temporalNumber !== null)
					&& (images[0].temporalNumber === numFrames);

	if (hasTemporalPosition && hasTemporalNumber) { // explicit series
		for (let ctr = 0; ctr < images.length; ctr += 1) {
			const image = images[ctr];

			const tempPos = image.temporalPosition;
			let dg = dicomMap.get(tempPos);
			if (!dg) {
				dg = [];
				dicomMap.put(tempPos, dg);
			}

			dg.push(image);
		}
	}
	else { // implicit series
		// order data by slice then time
		const timeBySliceMap = new OrderedMap<number, OrderedMap<number, DCMImage>>();
		for (let ctr = 0; ctr < images.length; ctr += 1) {
			if (images[ctr] !== null) {
				let sliceMarker = ctr;
				if (hasImagePosition) {
					sliceMarker = images[ctr].getImagePositionSliceDir(sliceDir);
				}
				else if (hasSliceLocation) {
					sliceMarker = images[ctr].sliceLocation;
				}

				let slice = timeBySliceMap.get(sliceMarker);
				if (!slice ) {
					slice = new OrderedMap<number, DCMImage>();
					timeBySliceMap.put(sliceMarker, slice);
				}

				(slice as OrderedMap<number, DCMImage>).put(ctr, images[ctr]);
			}
		}

		// copy into DICOM array (ordered by slice by time)
		const dicomsCopy: DCMImage[] = [];
		let dicomsCopyIndex = 0;
		const sliceIt = timeBySliceMap.iterator();
		while (sliceIt.hasNext()) {
			const slice = sliceIt.next();
			const timeIt = slice!.iterator();
			while (timeIt.hasNext()) {
				dicomsCopy[dicomsCopyIndex] = timeIt.next()!;
				dicomsCopyIndex += 1;
			}
		}

		// groups dicoms by timepoint
		for (let ctr = 0; ctr < dicomsCopy.length; ctr += 1) {
			if (dicomsCopy[ctr] !== null) {
				let dgFound: Images | undefined;
				const it = dicomMap.iterator();
				while (it.hasNext()) {
					const dg = it.next();
					if (!hasMatchingSlice(
						dg!,
						dicomsCopy[ctr],
						sliceDir,
						hasImagePosition,
						hasSliceLocation
					)) {
						dgFound = dg;
						break;
					}
				}

				if (!dgFound) {
					dgFound = [];
					dicomMap.put(dicomMap.orderedKeys.length, dgFound);
				}

				dgFound!.push(dicomsCopy[ctr]);
			}
		}
	}

	return dicomMap;
};

//--------------------------------------------------------
/**
 * It takes a list of images, and returns a list of images, ordered by time and space
 * @param {Images} images - The images to order.
 * @param {number} numFrames - The number of frames in the image.
 * @param {number} sliceDir - The direction of the slices.
 * @returns An array of images.
 */
const orderDicoms = (
	images: Images,
	numFrames: number,
	sliceDir: number
): Images => {
	const hasImagePosition = (images[0].imagePosition !== null);
	const hasSliceLocation = (images[0].sliceLocation !== null);
	const hasImageNumber = (images[0].imageNumber !== null);

	const timeMap = orderByTime(
		images,
		numFrames,
		sliceDir,
		hasImagePosition,
		hasSliceLocation
	);
	const timeIt = timeMap.orderedKeys;

	const imagesOrderedByTimeAndSpace:Images = [];

	for (let ctr = 0; ctr < timeIt.length; ctr += 1) {
		const dg = timeMap.get(timeIt[ctr])!;
		let ordered;
		if (hasImagePosition) {
			ordered = orderByImagePosition(dg, sliceDir);
		}
		else if (hasSliceLocation) {
			ordered = orderBySliceLocation(dg);
		}
		else if (hasImageNumber) {
			ordered = orderByImageNumber(dg);
		}
		else {
			ordered = dg;
		}

		for (let ctrIn = 0; ctrIn < ordered.length; ctrIn += 1) {
			imagesOrderedByTimeAndSpace.push(ordered[ctrIn]);
		}
	}

	for (let ctrIn = 0; ctrIn < imagesOrderedByTimeAndSpace.length; ctrIn += 1) {
		imagesOrderedByTimeAndSpace[ctrIn].index = ctrIn;
	}

	return imagesOrderedByTimeAndSpace;
};


////////////////////////////////////////////////////////////////////////////////
//********************************* SERIES of IMAGES ************************ */
////////////////////////////////////////////////////////////////////////////////

/* It's a container for a series of images, and it provides methods to order the images in the series,
and to get the pixel data for the series */
class Series {
	// static parserError: Error | null = null;

	/**
	 * True to keep original order of images, ignoring metadata-based ordering.
	 * @type {boolean}
	 */
	static useExplicitOrdering = false;

	/**
	 * A hint to software to use this explicit distance (mm) between
	 * slices (see Series.useExplicitOrdering)
	 * @type {number}
	 */
	static useExplicitSpacing: number = 0;

	images:Images = [];

	imagesOriginalOrder: Images | null = null;

	isMosaic: boolean = false;

	isElscint: boolean = false;

	isCompressed: boolean = false;

	numberOfFrames: number = 0;

	numberOfFramesInFile: number = 0;

	isMultiFrame: boolean = false;

	isMultiFrameVolume: boolean = false;

	isMultiFrameTimeseries: boolean = false;

	isImplicitTimeseries: boolean = false;

	sliceSense = false;

	sliceDir = SliceDirection.Unknown;

	error: Error | null = null;

	private frameInfo: FrameInfo | null = null;
//--------------------------------------------------------
	getOrder():number[] {
		const order:number[] = [];
		for (let ctr = 0; ctr < this.imagesOriginalOrder!.length; ctr += 1) {
			order[ctr] = this.imagesOriginalOrder![ctr].index;
		}
		return order;
	}
//--------------------------------------------------------
	/**
	 * Returns the series ID.
	 * @returns {string}
	 */
	toString():string {
		return this.images[0].seriesId;
	}
//--------------------------------------------------------
	/**
	 * Returns a nice name for the series.
	 * @returns {string|null}
	 */
	getName(): string | null {
		const des = this.images[0].seriesDescription;
		const uid = this.images[0].seriesInstanceUID;
		if (des !== null) {
			return des;
		}
		if (uid !== null) {
			return uid;
		}
		return null;
	}
//--------------------------------------------------------
	/**
	 * Adds an image to the series.
	 * @param {DCMImage} image
	 */
	addImage(image: DCMImage) {
		this.images.push(image);
	}
//--------------------------------------------------------
	/**
	 * Returns true if the specified image is part of the series
	 * (or if no images are yet part of the series).
	 * @param {DCMImage} image
	 * @returns {boolean}
	 */
	matchesSeries(image:any): boolean {
		if (this.images.length === 0) {
			return true;
		}
		return (this.images[0].seriesId === image.seriesId);
	}
//--------------------------------------------------------

	/**
	 * > The function `buildSeries()` is used to determine the type of series (e.g. is it a mosaic, is it
	 * a multi-frame, etc.) and to order the images in the series
	 */
	buildSeries() {
		const [image0] = this.images;
		this.isMosaic = image0.isMosaic();
		this.isElscint = image0.isElscint();
		this.isCompressed = image0.isCompressed();
		// check for multi-frame
		this.numberOfFrames = image0.numberOfFrames; //declared frames inside IOD, as per Dicom tag
		this.numberOfFramesInFile = image0.getNumberOfImplicitFrames(); //calculated from pixel buffer size
		this.isMultiFrame = (this.numberOfFrames > 1)
			|| (this.isMosaic && (image0.mosaicCols * image0.mosaicRows > 1));
		this.isMultiFrameVolume = false;
		this.isMultiFrameTimeseries = false;
		this.isImplicitTimeseries = false;

		/*multi-frame images contain multiple pixel planes/frames in the same IOD*/
		if (this.isMultiFrame) {
			const hasFrameTime = (image0.getFrameTime() > 0);
			if (this.isMosaic) {
				this.isMultiFrameTimeseries = true;
			}
			else if (hasFrameTime) {
				this.isMultiFrameTimeseries = true;
			}
			else if (this.numberOfFrames > 1 && this.images.length === 1) {/*not a mosaic here*/
				/*this series represents just a 3D volume in a single IOD (e.g., RTDose)*/
				this.isMultiFrameVolume = true;
				this.isMultiFrameTimeseries = false;
			}
			else {
				/* here we may have a series of images, each being a multi-frame. Unlikely!?*/
				// this.numberOfFrames = this.images.length;
				
				this.isMultiFrameTimeseries = true;
			}
		}
		else{
			this.numberOfFrames = this.images.length;
		}
		/* if many images are in the same position, it reflects an implicit time series*/
		if (!this.isMosaic && (this.numberOfFrames <= 1)) { // check for implicit frame count
			let imagePos = (image0.imagePosition || []);
			const sliceLoc = imagePos.toString();
			this.numberOfFrames = 0;
			for (let ctr = 0; ctr < this.images.length; ctr += 1) {
				imagePos = (this.images[ctr].imagePosition || []);
				if (imagePos.toString() === sliceLoc) {
					this.numberOfFrames += 1;
				}
			}
			if (this.numberOfFrames > 1) {
				this.isImplicitTimeseries = true;
			}
		}
		/*order the images in series and get their orientation*/
		this.sliceDir = image0.acquiredSliceDirection;
		let orderedImages: DCMImage[];
		if (Series.useExplicitOrdering) {
			orderedImages = this.images.slice();
		}
		else {
			orderedImages = orderDicoms(this.images, this.numberOfFrames, this.sliceDir);
		}
		const sliceLocationFirst = orderedImages[0].getImagePositionSliceDir(this.sliceDir);
		const sliceLocationLast = orderedImages[orderedImages.length - 1]
			.getImagePositionSliceDir(this.sliceDir);
		const sliceLocDiff = sliceLocationLast - sliceLocationFirst;

		if (Series.useExplicitOrdering) {
			this.sliceSense = false;
		}
		else if (this.isMosaic) {
			this.sliceSense = true;
		}
		else if (this.isMultiFrame) {
			const sliceLocations = orderedImages[0].sliceLocationVector;
			if (sliceLocations !== null) {
				const { orientation } = orderedImages[0];
				if (orientation?.charAt(2) === "Z") {
					this.sliceSense = (sliceLocations[0] - sliceLocations[sliceLocations.length - 1]) < 0;
				}
				else {
					this.sliceSense = (sliceLocations[0] - sliceLocations[sliceLocations.length - 1]) > 0;
				}
			}
			else {
				this.sliceSense = sliceLocationFirst >= 0;
			}
		}
		/*
		* "The direction of the axes is defined fully by the patient's orientation.
		* The x-axis is increasing to the left hand side of the patient. The
		* y-axis is increasing to the posterior side of the patient.
		* The z-axis is increasing toward the head of the patient."
		*/
		else if ((this.sliceDir === SliceDirection.Sagittal)
			|| (this.sliceDir === SliceDirection.Coronal)) {
			if (sliceLocDiff > 0) {
				this.sliceSense = false;
			}
			else {
				this.sliceSense = true;
			}
		}
		else if (sliceLocDiff > 0) {
			this.sliceSense = true;
		}
		else {
			this.sliceSense = false;
		}
		this.imagesOriginalOrder = this.images;
		this.images = orderedImages;
	}
//============================================================================
	/**
	 * It creates a 4x4 matrix that transforms a pixel coordinate to a patient coordinate
	 * @returns A 4x4 matrix that transforms pixel coordinates to patient coordinates.
	 */
	getMat4PixToPat()  {

		const m4 = twgl.m4;
		const v3 = twgl.v3;

		m4.setDefaultType(Float32Array);
		let mat4pix2pat = new Float32Array(16);
		
		const imgPos = this.images[0].imagePosition;		
		let imgLastPos:number[] = [0,0,0];
		/*either is a 3D volume image...*/
		if(this.isMultiFrameVolume){
			imgLastPos[0] = imgPos[0];
			imgLastPos[1] = imgPos[1];
			imgLastPos[2] = this.images[0].getFramesPositionZRange()[1];			
		}
		/*... or a series of spatially-ordered slices*/
		else if (!this.isMultiFrame){
			imgLastPos = this.images[this.images.length-1].imagePosition;
		}
		else {
			console.log("Can't create matrix for this image series: layout not supported");
			return mat4pix2pat;
		}
		const imgOrient  = this.images[0].imageDirections;	
		if(imgOrient === null){
			return twgl.m4.identity() as Float32Array;
		}
		const imgOrientR = imgOrient.slice(0,3);	
		const imgOrientC = imgOrient.slice(3,6);
		const pixSpacing =  this.images[0].pixelSpacing;
		
		let column3:twgl.v3.Vec3;
		if(this.numberOfFrames <= 1){
			column3 = v3.normalize(v3.cross(imgOrientR, imgOrientC));
			v3.mulScalar(column3, this.images[0].sliceThickness , column3);
		}
		else{
			/* subtract first from last image's vector position and divide by number of slice gaps*/
			column3 = v3.mulScalar(v3.subtract(imgLastPos, imgPos),
											1.0/(this.numberOfFrames-1));
		}

		for(let i=0; i < 3; i++){
			mat4pix2pat[0+i] = imgOrientR[0+i]*pixSpacing[0];
			mat4pix2pat[4+i] = imgOrientC[0+i]*pixSpacing[1];
			mat4pix2pat[8+i] = column3[0+i];
			mat4pix2pat[12+i] = imgPos[0+i];
		}
		mat4pix2pat[15] = 1;

		return  mat4pix2pat;
	}

	//============================================================================
	/* Returns a pixel block with its associated info, to be used for a texture3D-based representation.
	Whether the series is formed by separate images (like CT) describing a volume, or a multi-frame
	image like RTDose, the pixels are grouped together for texture 3D*/	
	async getFrames():Promise<FrameInfo> 
	{	
		let frameDataAray:Blob[] = [];
		let numImages:number = 0;
		let frameIndex:number = 0;
		
		const  displayInfo = displayInfoFromDecoderInfo(new DecoderInfo(this.images[0]));

		/*now let's see if we have a volume frame or a series of separate images*/
		if(this.numberOfFramesInFile > 1){
			numImages = 1;
			frameIndex = -1;
			displayInfo.nFrames = this.numberOfFramesInFile;
		}
		else {
			numImages = this.images.length;
			frameIndex = 0;
			displayInfo.nFrames = numImages;//this.numberOfFrames;
		}
		
		for(let currFrame = 0; currFrame < numImages; currFrame++){
			/* select the correct decoder for this image modality*/
			const decoder = decoderForImage(this.images[currFrame]);	
			/*decode frame-by-frame and accumulate*/
			const frameData = await decoder!.getFramePixels(frameIndex);
			/*concatenate all the frames' pixel data in one contiguous block*/
			frameDataAray.push(frameData);
		}
		let frameInfo = new FrameInfo({
			imageInfo: displayInfo,
			frameNo: -1,
			pixelData: new Blob(frameDataAray),
			mat4Pix2Pat: this.getMat4PixToPat(),
			outputSize: displayInfo.size,
		});

		this.frameInfo = frameInfo;
		return frameInfo;
	}

	/**
	 * This is an asynchronous function that returns a promise of a FrameInfo object, either by returning
	 * a cached version or by calling another function to retrieve it.
	 * @returns The `gocFrames()` function returns a `Promise` that resolves to a `FrameInfo` object. If
	 * `this.frameInfo` is not null, it returns `this.frameInfo` immediately. Otherwise, it calls the
	 * `getFrames()` function and waits for it to complete before returning the result.
	 */
	async gocFrames(): Promise<FrameInfo> {
		if (this.frameInfo !== null) return this.frameInfo;
		return await this.getFrames();
	}

	//============================================================================
	/* Converting a mosaic image into a non-mosaic image. */
	getMosaicData(image: DCMImage, data:Uint16Array | Uint8Array): ArrayBuffer {
		const [image0] = this.images;

		const mosaicWidth = image0.columns;
		const mosaicHeight = image0.rows;
		const { mosaicRows, mosaicCols } = image0;

		const numBytes = image0.bytesAllocated || 1;
		const numSlices = mosaicWidth * mosaicHeight;
		const numRows = Math.floor(mosaicHeight / mosaicRows);
		const numCols = Math.floor(mosaicWidth / mosaicCols);

		const mosaicRowHeight = Math.floor(mosaicHeight / mosaicRows);
		const mosaicColWidth = Math.floor(mosaicWidth / mosaicCols);

		const buffer = new Uint8Array(new ArrayBuffer(numSlices * numRows * numCols * numBytes));
		const dataTyped = new Uint8Array(data);
		let index = 0;
		for (let ctrS = 0; ctrS < numSlices; ctrS += 1) {
			for (let ctrR = 0; ctrR < numRows; ctrR += 1) {
				for (let ctrC = 0; ctrC < numCols; ctrC += 1) {
					const offset = getMosaicOffset(
						mosaicCols,
						mosaicColWidth,
						mosaicRowHeight,
						mosaicWidth,
						ctrC,
						ctrR,
						ctrS
					);
					for (let ctr = 0; ctr < numBytes; ctr += 1) {
						buffer[index] = dataTyped[(offset * numBytes) + ctr];
						index += 1;
					}
				}
			}
		}
		return buffer.buffer;
	}
}
export default Series;
