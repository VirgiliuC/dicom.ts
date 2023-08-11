import sha1 from "sha1";
import * as twgl from "twgl.js";
// import { decoderForImage, Decoder } from "../decoder";
import { ISize, ImageSize } from "../image/Types";
import { DCMImage } from "../parser";
import { Codec, IDisplayInfo } from "../image/Types";
import { IFrameInfo } from "../image/Types";
import { SliceDirection } from "../parser/constants";
import FrameInfo from "../image/FrameInfo";
import IProgram, { Uniforms, IDrawObject,IColorProgramType, IGreyscaleProgramType, IProgramSignature } from "./Program";
import GreyscaleProgram from "./GreyscaleProgram";
import GreyscaleLUTProgram from "./GreyscaleLUTProgram";
import ContrastifyProgram from "./ContrastifyProgram";
import ColorProgram from "./ColorProgram";
import ColorPaletteProgram from "./ColorPaletteProgram";
import { isGeneratorFunction } from "util/types";

/* This class needs to be able to:
    - add FrameInfo objects (could be from a Image Series or any other patient-derived 3D image)
    - replace or remove (set null) a FrameInfo object at a given location in its internal array
    - define the viewport for current rendering
    - render slices in Axial, Sagittal and Coronal view
    - set/get the current slicing direction ([A,S,C] planes)
    - set/get a patient coord. point, defining the position of the [A,S,C] planes
    - set/get twgl-like DrawObjects, for adding other rendering elements like tools or overlays
    - minimize the calculations when changing rendering params (only re-compute what was changed)
*/
class Renderer {
	canvas: HTMLCanvasElement;

	private viewport:[number,number,number,number] =[0,0, 512,512];
    /*the intersection point of Axial, Sagittal and Coronal planes*/
    private cuttingPoint:twgl.v3.Vec3 = [0,0,0];

	private gl: WebGL2RenderingContext;

	private programCacheMap: Map<string, IProgram>;
    /* we accept 3 image sets for the time being, to be overlaid*/
    protected frameSets: Array<FrameInfo | null> = Array(3); 
    protected mmPatMinAABB:twgl.v3.Vec3 = [0,0,0];
	protected mmPatMaxAABB:twgl.v3.Vec3 = [0,0,0];
	protected sharedUniforms: Uniforms;

    protected imgDrawObjectArray: Array<IDrawObject> = Array(0);
    protected toverlayDrawObjectArray: Array<IDrawObject> = Array(0);
    protected soverlayDrawObjectArray: Array<IDrawObject> = Array(0);

	/**
	 * It creates a new WebGL2RenderingContext object.
	 * @param {HTMLCanvasElement | null} inCanvas - HTMLCanvasElement | null
	 */
	constructor(inCanvas: HTMLCanvasElement | null) {
		const canvas = inCanvas || document?.createElement("canvas") || new HTMLCanvasElement();
		
		/* It creates a new WebGL2RenderingContext object. */
		const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, });
		if (!gl) {
			throw Error("could not create webgl2 from canvas");
		}
		this.canvas = canvas;
		this.gl = gl!;
		this.programCacheMap = new Map<string, IProgram>();
		this.sharedUniforms = {
			u_matrix_model: twgl.m4.identity(),
			u_matrix_view:  twgl.m4.identity(),
			u_matrix_proj:  twgl.m4.identity(),
			u_sliceDir: SliceDirection.Axial
		};
	}

    /**
     * > It takes an array of FrameInfo objects, creates a texture for each one, selects the correct
     * GLSL program for each one, and then creates a DrawObject for each one
     * @param framesArray - Array<FrameInfo | null>
     */
    async setFrameSets(framesArray: Array<FrameInfo | null>): Promise<void> {
		const { gl } = this;
        /*clear up the draw objects list*/
        this.imgDrawObjectArray = [];
        /*shallow copy of non-nulls*/
        this.frameSets = framesArray.filter((item) => item !== null);
        if(this.frameSets.length === 0){
            console.log("No non-null frame sets passed in the input array");
            return;
        }
        /* determine the patient volume encompassing all the frame sets*/
        this.computePatAABBfromImages();
        /* now compute the whole M-V-P matrix chain, updating the shared uniforms*/
        this.computeMat4Model();
        this.computeMat4View();
        this.computeMat4Proj();	
        /*reset the cutting point to somewhere meaningful*/
        const {width, height} =this.frameSets[0]!.imageInfo!.size;
        this.cutIndex = [width/2,height/2,0];	
        /* select the rendering program and populate the DrawObject List*/
        // this.frameSets.forEach(async (frames) => {
		for (const frames of this.frameSets) {
            if(frames !== null){
                /* only create a new texture if there's no valid one already*/
                if(!frames.texture || gl.isTexture(frames.texture) === false){
					try {
                    	frames.texture = await this.createTexture(frames);
					}	catch(err){
							console.log(err)
					};
                }
				if (frames.visible) {
					/* select the correct GLSL program for this image modality*/
					let program;
					/* if the frame info has a custom program use it else try and find a program for it */
					if (frames.customProgram !== undefined) {
						program = frames.customProgram;
					}
					else {
						program = this.getProgram(frames.imageInfo);
					}
					/* get the Program to generate its DrawObject and add it to the list*/
					let drawObj:IDrawObject = program?.makeDrawObject(frames);
					drawObj.uniforms.push(this.sharedUniforms);
					this.imgDrawObjectArray.push(drawObj);
				}			
            }
		}
        // });

		return Promise.resolve();
		/*there you go! :)*/
    }

	
    /**
     * > We set the viewport, clear the canvas, and then draw all the objects in the
     * `imgDrawObjectArray` array
     */
    render() {
		// parent class implementation...
    }
    /**
     * It returns the number of frame sets in the animation
     * @returns The number of frame sets in the animation.
     */
    getFrameSetsCount(): number {
        return this.frameSets.length;
    }

	/**
	 * This function returns a copy of the sharedUniforms object, which contains 
	 * the projection, view, and model matrices.
	 * @returns A copy of the sharedUniforms object.
	 */
	getSharedUniforms(): Uniforms {
        return {...this.sharedUniforms};
    }
	
	/**
	 * @returns The WebGL2RenderingContext object.
	 */
	get wgl2():WebGL2RenderingContext {		
		return this.gl;
	}

	/**
     * The function takes a 4-element array of numbers as an argument, and assigns the array to the
     * viewport property of the object
     * @param vp - [x,y,width,height]
     */
    set outputSize(vp:[number,number,number,number]) {
		this.viewport = [...vp];
        /* when we have images, also renew the orthographic matrix, keeping the aspect ratio*/
        if(this.frameSets.length > 0){
            this.computeMat4Proj();
        }
	}

	/**
     * > The `outputSize` property returns the current viewport size
     * @returns The viewport property of the current instance of the class.
     */
    
	get outputSize():[number,number,number,number] {		
		return [...this.viewport];
	}
    
    
    /**
     * The function `set cutPoint(cut_point: twgl.v3.Vec3)` sets the cutting point of the object to the
     * value of the argument `cut_point` and then computes the model matrix
     * @param cut_point - the point where the cut is made.
     */
    set cutPoint(cut_point: twgl.v3.Vec3) {
		this.cuttingPoint = [...cut_point];
        /* when we have images, also renew the Model matrix, moving the slice in the right place*/
        if(this.frameSets.length > 0 && this.frameSets[0] !== undefined){
            this.computeMat4Model();
        }
	}
    
	/**
     * It returns the slicing point.
     * @returns A copy of the cuttingPoint array.
     */
    get cutPoint():twgl.v3.Vec3 {		
		return [...this.cuttingPoint];
	}

   /**
    * The function takes in an array of pixel indices, converts them to milimiters, and then sets the
    * cutPoint property to the converted value
    * @param {number[]} cut_index - the pixel index of the cut point
    */
    set cutIndex(cut_index: number[]) {
		if(this.frameSets.length > 0 && this.frameSets[0] !== undefined){
            /*convert pixel index to milimiters*/
            this.cutPoint = this.frameSets[0]!.getPix2MM(cut_index);
        }
	}
    
    /**
     * > The function returns the pixel index of the cut point
     * @returns The cutIndex is being returned.
     */
    get cutIndex():number[] {
        if(this.frameSets.length > 0){
            /*convert milimiters to pixel index*/
            return this.frameSets[0]!.getMM2Pix([...this.cutPoint]) ;	
        }
		return [-1,-1,-1];
	}

	/**
	 * The function takes an array of objects that implement the IDrawObject interface and assigns it to
	 * the transparent toverlayDrawObjectArray property. 
	 * It renders a possibly alpha-transparent overlay, which could be annotation, segmentation, etc.
	 * @param tobjs - Array<IDrawObject> - This is the array of objects that you want to draw on top of the
	 * images, but below the tools.
	 */
	set toverlayObjects(tobjs: Array<IDrawObject> )  {
        this.toverlayDrawObjectArray = [];

        for (let i = 0; i < tobjs.length; i++) {
			let localDrawObject: IDrawObject = {
				...tobjs[i],
				programInfo: tobjs[i].programInfo,
				bufferInfo: tobjs[i].bufferInfo,
				uniforms: [...tobjs[i].uniforms, this.sharedUniforms]
			};

			this.toverlayDrawObjectArray.push(localDrawObject);
        }
    }
	/**
	 * This function returns an array of IDrawObjects, forming the transparent overlay (annotation, segmentation, etc.).
	 * @returns An array of overlay IDrawObjects.
	 */
	get toverlayObjects(): Array<IDrawObject>  {
		return this.toverlayDrawObjectArray;
	}
	/**
	 * This function takes an array of IDrawObjects and assigns it to the soverlayDrawObjectArray property.
	 * It draws a set of solid opaque objects on the very top, usually used for temporary tools (rulers, protractor,etc.)
	 * @param tools - Array<IDrawObject> - This is the array of solid objects that you want to add to the canvas.
	 */
	set soverlayObjects(tools: Array<IDrawObject> )  {
		this.soverlayDrawObjectArray = [];

        for (let i = 0; i < tools.length; i++) {
			let localDrawObject: IDrawObject = {
				...tools[i],
				programInfo: tools[i].programInfo,
				bufferInfo: tools[i].bufferInfo,
				uniforms: [...tools[i].uniforms, this.sharedUniforms]
			};

			this.soverlayDrawObjectArray.push(localDrawObject);
        }
	}
	/**
	 * This function returns an array of IDrawObjects, which are drawn at the end, as solid opaque entities (usually screen tools).
	 * @returns The soverlayDrawObjectArray
	 */
	get soverlayObjects(): Array<IDrawObject>  {
		return this.soverlayDrawObjectArray;
	}

    /**
     * It takes a point in millimeters and returns a point in screen normalized coordinates
     * @param {number[]} mmPoint - the point in millimeters to convert to screen normalized coordinates
     * @returns The screen normalized point.
     */
    converPointToScreenNormalized(mmPoint:twgl.v3.Vec3):twgl.v3.Vec3 {
        let scrNormPnt: twgl.v3.Vec3 = [0,0,0];
        twgl.m4.transformPoint(this.sharedUniforms.u_matrix_view,mmPoint,scrNormPnt);
        twgl.m4.transformPoint(this.sharedUniforms.u_matrix_proj,scrNormPnt,scrNormPnt);
        return scrNormPnt;
    }


  /**
   * > The function computes the patient AABB from the image AABBs
   */
   protected computePatAABBfromImages(){
    /* Reset the patient AABB for a fresh computation*/     
    this.mmPatMinAABB = [Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE];
	this.mmPatMaxAABB = [-Number.MAX_VALUE,-Number.MAX_VALUE,-Number.MAX_VALUE];
     /*search each valid frame set and get the encompassing AABB for all*/
		this.frameSets.forEach((frames) => {
            if(frames) {
            const {size, nFrames} = frames.imageInfo;
			/* offset the size from the voxel centre to the voxel borders*/	
			// const pixOffset = -0.5;
            const pixPatMinAABB:twgl.v3.Vec3 = [-0.5,-0.5,-0.5];
            const pixPatMaxAABB:twgl.v3.Vec3= [size.width-0.5,size.height-0.5,nFrames-0.5];
            const mmPatMinAABB:twgl.v3.Vec3 = [0,0,0];
            const mmPatMaxAABB:twgl.v3.Vec3 = [0,0,0];
            /*transform patient pixel AABB in mm PCS*/
            twgl.m4.transformPoint(frames.mat4Pix2Pat,pixPatMinAABB,mmPatMinAABB);
            twgl.m4.transformPoint(frames.mat4Pix2Pat,pixPatMaxAABB,mmPatMaxAABB);
            twgl.v3.min(mmPatMinAABB,this.mmPatMinAABB,this.mmPatMinAABB);
            twgl.v3.max(mmPatMaxAABB,this.mmPatMaxAABB,this.mmPatMaxAABB);
            }
        });
    }
    /**
     * > The function computes the model matrix for the current slicing direction, and the current
     * slicing point
     */
    protected computeMat4Model (){
		// parent class implementation...
		this.sharedUniforms.u_matrix_model = twgl.m4.identity();
    }
    
    /**
     * > The function computes the view matrix for the current slicing direction
     */
    protected computeMat4View (){
		// parent class implementation...
		this.sharedUniforms.u_matrix_view = twgl.m4.identity();
    }
 
   /**
    * > The function computes the orthographic projection matrix for the current slice
    */
    protected computeMat4Proj (){
		// parent class implementation...
		this.sharedUniforms.u_matrix_proj = twgl.m4.identity();
    }

	/**
	 * It creates a WebGL texture from a frame of a DICOM image
	 * @param {IFrameInfo} frame - IFrameInfo - This is the frame that is being decoded.
	 * @returns A promise that resolves to a WebGLTexture.
	 */
	protected async createTexture(frame: IFrameInfo):Promise<WebGLTexture> {
		/* Getting the pixels of the image. */
		const { gl } = this;
		const pixelData = await frame.pixelData.arrayBuffer();
		const bytes = new Uint8Array(pixelData);
		let { height }  = frame.imageInfo.size;
		const { width } = frame.imageInfo.size;
		const image  = frame.imageInfo;
		let format: number = gl.LUMINANCE_ALPHA;
		let internalFormat: number = gl.LUMINANCE_ALPHA;
		if (image.rgb && !image.planar && !image.palette) {
			format = gl.RGB;
			internalFormat = gl.RGB;
		}
		else if (image.bytesAllocated === 1) {
			format = gl.LUMINANCE;
			internalFormat = gl.LUMINANCE;
		}
		if (image.planar) {
			height *= image.samples;
		}
		/* we always use a 3D texture, as they are also available on mobile devices nowadays*/
		let depth = frame.imageInfo.nFrames;
		let texTarget = gl.TEXTURE_3D;
		let minMag = image.signed ? gl.NEAREST : gl.LINEAR;
		const maxSize3D = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
		if(width > maxSize3D ||  height > maxSize3D || depth  > maxSize3D)
			return Promise.reject("Texture size too large");
		return Promise.resolve(twgl.createTexture(gl, {
			src: bytes,
			target: texTarget,
			level: 0,
			width,
			height,
			depth,
			format,
			internalFormat,
			type: gl.UNSIGNED_BYTE,
			min: minMag,
			mag: minMag,
			wrap: gl.CLAMP_TO_EDGE,
		}));
	}

	//----------------------------------------------------------------------------
	clear(): void {
		const { gl, canvas } = this;
		// canvas.width = 0; // zero the canvas, makes resize much faster!
		// canvas.height = 0;
		// eslint-disable-next-line no-bitwise
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
	}

	//----------------------------------------------------------------------------
	destroy(aggressive:boolean = false): void {
		this.programCacheMap.forEach((program) => {
			program.destroy();
		});
		this.programCacheMap = new Map();
		if (aggressive) {
			// https://stackoverflow.com/questions/23598471/how-do-i-clean-up-and-unload-a-webgl-canvas-context-from-gpu-after-use
			this.gl.getExtension("WEBGL_lose_context")?.loseContext();
			this.canvas.width = 1;
			this.canvas.height = 1;
		}
	}

	//----------------------------------------------------------------------------
	/**
	 * It takes an image info object and returns a program object
	 * @param {IDisplayInfo} imageInfo - IDisplayInfo
	 * @returns A program object.
	 */
	private getProgram(imageInfo: IDisplayInfo): IProgram {
		const { gl } = this;
		let signature: IProgramSignature | null = null;
		if (imageInfo.palette) {
			signature = {
				hash: sha1(ColorPaletteProgram.programStringForInfo(imageInfo)).toString(),
				Type: ColorPaletteProgram
			};
		}
		else if (imageInfo.rgb) {
			signature = {
				hash: sha1(ColorProgram.programStringForInfo(imageInfo)).toString(),
				Type: ColorProgram
			};
		}
		else if (imageInfo.windowCenter
			|| imageInfo.minPixVal
			|| imageInfo.maxPixVal
		) {
			signature = {
				hash: sha1(GreyscaleProgram.programStringForInfo(imageInfo)).toString(),
				Type: GreyscaleProgram
			};
		}
		else if (imageInfo.lut) {
			signature = {
				hash: sha1(GreyscaleLUTProgram.programStringForInfo(imageInfo)).toString(),
				Type: GreyscaleLUTProgram
			};
		}
		else {
			const [s0, s1] = ContrastifyProgram.programStringForInfo(imageInfo);
			signature = {
				hash: sha1(s0 + s1).toString(),
				Type: ContrastifyProgram
			};
		}
		let program = this.programCacheMap.get(signature.hash);
		if (!program) {
			program = new signature.Type(gl, imageInfo) as IProgram;
			this.programCacheMap.set(signature.hash, program);
		}
		return program;
	}

	/**
	 * prime the renderer with specific programs
	 * this can improve 1st image render time quite dramatically
	 * @param programType
	 */
     primeGreyscale(programType: IGreyscaleProgramType) {
		const {
			hasLut,
			invert,
			signed,
			bitsAllocated,
			bitsStored,
			littleEndian,
			hasPixelPaddingValue,
			knownWindow,
		} = programType;
		const imageType: IDisplayInfo = {
			image: new DCMImage(),
			nFrames: 1,
			rgb: false,
			planar: false,
			signed: signed ?? false,
			size: new ImageSize({ width: 0, height: 0 }),
			codec: Codec.Uncompressed,
			samples: 0,
			bitsAllocated: bitsAllocated ?? 16,
			bytesAllocated: (bitsAllocated ?? 16) / 8,
			bitsStored: bitsStored ?? bitsAllocated ?? 16,
			littleEndian: littleEndian ?? true,
			data: new DataView(new ArrayBuffer(0)),

			lut: hasLut ? {
				nEntries: 0,
				firstValue: 0,
				bitsStored: 0,
				data: new Uint8Array(0)
			} : null,

			palette: null,
			invert: invert ?? false,
			pixelPaddingVal: hasPixelPaddingValue ? 1 : null,
			minPixVal: null,
			maxPixVal: null,
			windowCenter: knownWindow ? 0.5 : null,
			windowWidth: knownWindow ? 1 : null,
			slope: 1,
			intercept: 0,
			modulationColor: [1,1,1,1]
		};
		this.getProgram(imageType);
	}

	/**
	 * prime the renderer with specific programs
	 * this can improve 1st image render time quite dramatically
	 * @param programType
	 */
	primeColor(programType: IColorProgramType) {
		const {
			planar,
			bitsAllocated,
			signed,
			littleEndian,
			hasPaletteWithWordBits,
			invert,
		} = programType;
		const imageType: IDisplayInfo = {
			image: new DCMImage(),
			nFrames: 1,
			rgb: true,
			planar: planar ?? false,
			signed: signed ?? false,
			size: new ImageSize({ width: 0, height: 0 }),
			codec: Codec.Uncompressed,
			samples: 3,
			bitsAllocated,
			bytesAllocated: bitsAllocated / 8,
			bitsStored: bitsAllocated,
			littleEndian: littleEndian ?? true,
			data: new DataView(new ArrayBuffer(0)),
			lut: null,
			palette: hasPaletteWithWordBits ? {
				nEntries: 0,
				firstValue: 0,
				bitsAllocated: hasPaletteWithWordBits,
				r: new DataView(new ArrayBuffer(0)),
				g: new DataView(new ArrayBuffer(0)),
				b: new DataView(new ArrayBuffer(0)),
			} : null,
			invert: invert ?? false,
			pixelPaddingVal: null,
			minPixVal: null,
			maxPixVal: null,
			windowCenter: null,
			windowWidth: null,
			slope: 1,
			intercept: 0,
			modulationColor: [1,1,1,1]
		};
		this.getProgram(imageType);
	}

}

export default Renderer;
