import * as twgl from "twgl.js";

import { ImageSize , IDisplayInfo, IFrameInfo} from "./Types";
import IProgram from "../renderer/Program";



//--------------------------------------------------------
interface IFrameInfoConstructor {
	imageInfo: IDisplayInfo;
	frameNo: number;
	pixelData: Blob;
	mat4Pix2Pat: Float32Array;
	outputSize: ImageSize;
	customProgram?: IProgram;
	visible?: boolean;
}

//--------------------------------------------------------
/* `FrameInfo` is a class that holds the information about a single frame set of a DICOM image */
class FrameInfo implements IFrameInfo {
	frameNo: number;

	imageInfo: IDisplayInfo;
	
	pixelData: Blob;

	mat4Pix2Pat: Float32Array = new Float32Array();

	texture: WebGLTexture = 0;

	customProgram?: IProgram | undefined;

	visible?: boolean | undefined;

	constructor(info: IFrameInfoConstructor) {
		this.imageInfo 	= info.imageInfo;
		this.frameNo 	= info.frameNo;
		this.pixelData 	= info.pixelData;
		this.mat4Pix2Pat= info.mat4Pix2Pat;
		this.customProgram = info.customProgram;
		this.visible = info.visible === undefined ? true : info.visible;
	}
	
	getPix2MM(pixpnt:number[]): number[] {
		return [...twgl.m4.transformPoint(this.mat4Pix2Pat,pixpnt)];
	}
	
	getMM2Pix(patpnt:number[]): number[] {
		let mat4Pat2Pix = twgl.m4.inverse(this.mat4Pix2Pat);
		return [...twgl.m4.transformPoint(mat4Pat2Pix, patpnt)];
	}

	destroy():void {
		// if(this.gl.isTexture(this.texture)){
		// 	this.gl.deleteTexture(this.texture);
		// }
	}

	/**
	 * The function clones a FrameInfo object with the same properties.
	 * @param {FrameInfo} frameInfo - The input object containing information about a frame, including
	 * frame number, image information, pixel data, output size, transformation matrix, custom program,
	 * and visibility status.
	 * @returns A cloned FrameInfo
	 */
	static clone(frameInfo: FrameInfo) {
		let newFrameInfo = new FrameInfo({
			frameNo: frameInfo.frameNo,
			imageInfo: Object.assign({}, frameInfo.imageInfo),
			pixelData: frameInfo.pixelData,
			outputSize: frameInfo.imageInfo.size,
			mat4Pix2Pat: frameInfo.mat4Pix2Pat,
			customProgram: frameInfo.customProgram,
			visible: frameInfo.visible
		});
		newFrameInfo.imageInfo.palette = Object.assign({}, null);
		return newFrameInfo;
	}
}

export default FrameInfo;
