import sha1 from "sha1";
import * as twgl from "twgl.js";
// import { decoderForImage, Decoder } from "../decoder";
import { ImageSize } from "../image/Types";
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

	image: DCMImage | null = null;

	private viewport:[number,number,number,number] =[0,0, 512,512];
    /*the intersection point of Axial, Sagittal and Coronal planes*/
    private cuttingPoint:twgl.v3.Vec3 = [0,0,0];
    private slicingDir:SliceDirection = SliceDirection.Axial;

	private gl: WebGL2RenderingContext;

	private program: IProgram | null = null;

	private programCacheMap: Map<string, IProgram>;
    /* we accept 3 image sets for the time being, to be overlaid*/
    private frameSets: Array<FrameInfo | null> = Array(3); 
    private mmPatMinAABB:twgl.v3.Vec3 = [0,0,0];
	private mmPatMaxAABB:twgl.v3.Vec3 = [0,0,0];
	private sharedUniforms: Uniforms;

    /* we accept multiple image sets, to be overlaid and mixed*/

    private   imgDrawObjectArray: Array<IDrawObject> = Array(0);
    protected toverlayDrawObjectArray: Array<IDrawObject> = Array(0);
    protected soverlayDrawObjectArray: Array<IDrawObject> = Array(0);

	// panning
	private deltaT: Array<number> = [0,0,0,0];
	private deltaB: Array<number> = [0,0,0,0];
	private deltaL: Array<number> = [0,0,0,0];
	private deltaR: Array<number> = [0,0,0,0];

	// zooming
	private minScale: number = 0.01;
	private maxScale: number = 1;
	private scale: Array<number> = [1,1,1,1];

	// orbiting
	private orbitAngle: Array<number> = [0,0];
	private orbitRadius: number = 100;

	// 3D control
	private pivotPoint: twgl.v3.Vec3 = [0,0,0];
    
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
        let {imgDrawObjectArray} = this;
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
		this.slicingDirection = this.slicingDir;
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
        const { gl } = this;        
        const {viewport} =this;
        /* let's set the viewport as xo, yo, width, height respectively*/
        gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(viewport[0],viewport[1],viewport[2],viewport[3]);
        gl.clearColor(0,0,0,1);
		gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        /*here we will blend all the images according to their alpha (use modulation colour)*/
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// draw all 3 planes in 3D
		if (this.slicingDir === SliceDirection._3D) {
			// enable depth test if we are in a 3D view
			gl.enable(gl.DEPTH_TEST);

			this.slicingDir = SliceDirection.Axial;
			this.computeMat4Model();
			twgl.drawObjectList(gl, this.imgDrawObjectArray);

			this.slicingDir = SliceDirection.Sagittal;
			this.computeMat4Model();
			twgl.drawObjectList(gl, this.imgDrawObjectArray);

			this.slicingDir = SliceDirection.Coronal;
			this.computeMat4Model();
			twgl.drawObjectList(gl, this.imgDrawObjectArray);

			this.slicingDir = SliceDirection._3D;
		}
		// else draw one plane at the current slicing dir
		else {
			twgl.drawObjectList(gl, this.imgDrawObjectArray);
		}

        twgl.drawObjectList(gl, this.toverlayDrawObjectArray);
        gl.disable(gl.BLEND);
        twgl.drawObjectList(gl, this.soverlayDrawObjectArray);
		gl.disable(gl.DEPTH_TEST);
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
	protected computeMat4Model(){
		const renderDir:number = this.slicingDir as number;

		const {mmPatMinAABB, mmPatMaxAABB} = this;

		//----- Model matrix ----//
		const rotAngles:number[] 	= [-Math.PI/2, Math.PI/2, 0];
		const rotAxes:twgl.v3.Vec3[]= [[0,1,0],[1,0,0],[0,0,1]];
		const frameLoc:twgl.v3.Vec3 = [0,0,0];
		/*translate with the required distance from mmPatMin to cutPoint, along the slicing dir*/
		frameLoc[renderDir] 		= this.cuttingPoint[renderDir]-mmPatMinAABB[renderDir];
		
		/*use normalized coords. below*/
		const Tto 	= twgl.m4.translation( [1,1,1]);//translate to origin
		const Ry 	= twgl.m4.axisRotation(rotAxes[renderDir], rotAngles[renderDir]);//rotate in origin
		const Tfo 	= twgl.m4.translation( [-1,-1,-1]);//translate back from origin
		const Ttf 	= twgl.m4.translation(frameLoc);//move the frame plane into the slicing point
		/*convert normalized to patient coords. using an inverted ortho projection matrix */
		const n2pat	= twgl.m4.inverse( 
			twgl.m4.ortho(mmPatMinAABB[0], mmPatMaxAABB[0], 
							mmPatMinAABB[1], mmPatMaxAABB[1],
							-mmPatMinAABB[2],-mmPatMaxAABB[2]));
		/*multiply all the matrices to form the final 'model' transform. Order's Important!*/  
		let mat_model:twgl.m4.Mat4;      
		mat_model = twgl.m4.multiply(Ry, Tto);
		mat_model = twgl.m4.multiply(Tfo, mat_model);
		mat_model = twgl.m4.multiply(n2pat, mat_model);
		mat_model = twgl.m4.multiply(Ttf, mat_model);

		this.sharedUniforms.u_matrix_model = mat_model;
	}
	
	/**
	 * > The function computes the view matrix for the current slicing direction
	 */
	protected computeMat4View(){
		const renderDir:number = this.slicingDir as number;

		const {mmPatMinAABB, mmPatMaxAABB} = this;
		let mat_view:twgl.m4.Mat4;    
		//----- View matrix ----//
		const centerAABB:twgl.v3.Vec3 = twgl.v3.divScalar(twgl.v3.add(mmPatMinAABB,mmPatMaxAABB),2);
		const eye = {...centerAABB}; 	eye[renderDir] = mmPatMinAABB[renderDir];
		const target = {...centerAABB};	target[renderDir] = mmPatMaxAABB[renderDir];
		const upVec:twgl.v3.Vec3[] 	= [[0,0,1],[0,0,1],[0,-1,0]];//[S,C,A]
		/*this matrix moves the camera into position, so needs inverting for a propoer view matrix*/  
		mat_view = twgl.m4.lookAt(eye,target,upVec[renderDir]);
		mat_view = twgl.m4.inverse(mat_view);
		this.sharedUniforms.u_matrix_view = mat_view;
	}
	
	/**
	* > The function computes the orthographic projection matrix for the current slice
	*/
	protected computeMat4Ortho(){
		const renderDir:number = this.slicingDir as number;

		const {mmPatMinAABB, mmPatMaxAABB} = this;
		let mat_ortho:twgl.m4.Mat4;    
		//----- Ortho Proj ----//
		const {viewport} =this;
		const VW = viewport[2];
		const VH = viewport[3];
		const mmPatSize = twgl.v3.subtract(mmPatMaxAABB,mmPatMinAABB);
		if(mmPatSize[2] === 0) {
			mmPatSize[2] = mmPatSize[2] + 0.00;
		}
		const mmOffset = 0.05; //guard against degenerate case of single image
		const hW:number[] = [mmPatSize [1]/2,mmPatSize [0]/2,mmPatSize [0]/2];
		const hH:number[] = [mmPatSize [2]/2,mmPatSize [2]/2,mmPatSize [1]/2]; 
		// const near:number = 0; 	
		// const far:number  =  mmPatSize [renderDir]+1.0;
		const near:number = (this.cutPoint[renderDir]-0.5-mmPatMinAABB[renderDir]); 	
		const far:number  = (this.cutPoint[renderDir]+0.5-mmPatMinAABB[renderDir]);

		const VAR = VW/VH;//viewport aspect ratio
		const OAR = (hW[renderDir])/(hH[renderDir]);//ortho projection aspect ratio
		/* we need to preserve the aspect ratio of the images, if viewport is different size=wise*/
		if(VAR > OAR){
			mat_ortho  = twgl.m4.ortho(
				(-hW[renderDir]*VAR/OAR)*this.scale[renderDir]+this.deltaL[renderDir],
				(hW[renderDir]*VAR/OAR)*this.scale[renderDir]+this.deltaR[renderDir],
				(-hH[renderDir])*this.scale[renderDir]+this.deltaB[renderDir],
				(hH[renderDir])*this.scale[renderDir]+this.deltaT[renderDir],
				near,far
			);
		}
		else{
			mat_ortho  = twgl.m4.ortho(
				(-hW[renderDir])*this.scale[renderDir]+this.deltaL[renderDir],
				(hW[renderDir])*this.scale[renderDir]+this.deltaR[renderDir],
				(-hH[renderDir]*OAR/VAR)*this.scale[renderDir]+this.deltaB[renderDir],
				(hH[renderDir]*OAR/VAR)*this.scale[renderDir]+this.deltaT[renderDir],
				near,far
			);
		};
		this.sharedUniforms.u_matrix_proj = mat_ortho;
	}

	/**
	 * The function computes a perspective matrix for a 3D rendering using the given angle, viewport
	 * dimensions, and near/far clipping planes.
	 */
	protected computeMat4Perspective() {
		const { viewport } = this;
		const VW = viewport[2];
		const VH = viewport[3];

		const angle = 60;
		const aspect = VW/VH;
		const near = 20;
		const far = 1000;

		this.sharedUniforms.u_matrix_proj = twgl.m4.perspective(
			(angle * Math.PI) / 180,
			aspect,
			near,
			far,
		);
	}

	/**
	 * The function computes a view matrix for a 3D scene by applying rotations, translations, and zooming
	 * based on user input.
	 */
	protected computeMat4View3D() {
		// compute view matrix for axial direction
		this.slicingDir = SliceDirection.Axial;
		this.computeMat4View();
		this.slicingDir = SliceDirection._3D;

		// pivot point
		const { mmPatMinAABB, mmPatMaxAABB } = this;
		const centerAABB = twgl.v3.divScalar(twgl.v3.add(mmPatMinAABB,mmPatMaxAABB),2);
		this.pivotPoint = [...centerAABB];

		// rotation axes
		const rotAxes:twgl.v3.Vec3[]= [[0,1,0],[1,0,0],[0,0,1]];

		const stiffness = 4;

		// rotation matrices
		let rotX = twgl.m4.axisRotation(rotAxes[0], ((this.orbitAngle[0]/stiffness) * Math.PI) / 180);
		let rotY = twgl.m4.axisRotation(rotAxes[1], ((this.orbitAngle[1]/stiffness) * Math.PI) / 180);

		// rotation around pivot point
		const Tp = twgl.m4.translation([-this.pivotPoint[0], -this.pivotPoint[1], -this.pivotPoint[2]]);
		const rotation = twgl.m4.multiply(rotX, rotY); 
		const Tfp = twgl.m4.translation([this.pivotPoint[0], this.pivotPoint[1], this.pivotPoint[2]]);
		const transformation = twgl.m4.multiply(Tfp, twgl.m4.multiply(rotation, Tp));

		// lookAt matrix from the view matrix
		const lookAt = twgl.m4.inverse(this.sharedUniforms.u_matrix_view);

		const transformedLookAt = twgl.m4.multiply(transformation, lookAt);
		const u_matrix_view = twgl.m4.inverse(transformedLookAt);

		// pan the view matrix
		const dir3D = SliceDirection._3D;

		// (x, y) --> pan. (z) --> zoom.
		const panZoomTranslation = twgl.m4.translation([
			this.deltaL[dir3D] / -2, 
			this.deltaT[dir3D] / -2, 
			this.scale[dir3D]  * -this.orbitRadius
		]);

		this.sharedUniforms.u_matrix_view = twgl.m4.multiply(panZoomTranslation, u_matrix_view);
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
			if (this.slicingDir === SliceDirection._3D) {
				this.computeMat4Perspective();
			}
			else {
				this.computeMat4Ortho();
			}
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
        if(this.frameSets.length > 0 && this.frameSets[0] !== undefined) {
			if (this.slicingDir !== SliceDirection._3D) {
				this.computeMat4Ortho();
				this.computeMat4Model();
			}
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
        if(this.frameSets.length > 0 && this.frameSets[0] !== undefined){
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
		let {sharedUniforms} = this.sharedUniforms;
        twgl.m4.transformPoint(this.sharedUniforms.u_matrix_view,mmPoint,scrNormPnt);
        twgl.m4.transformPoint(this.sharedUniforms.u_matrix_proj,scrNormPnt,scrNormPnt);
        return scrNormPnt;
    }

    /**
     * > When the user changes the slicing direction, we need to recompute the whole M-V-P matrix chain
     * @param {SliceDirection} slice_dir - SliceDirection
     */
    set slicingDirection(slice_dir: SliceDirection) {
		this.slicingDir = slice_dir;
		this.sharedUniforms.u_sliceDir = slice_dir;
        /* when we have images, renew the whole M-V-P matrix chain*/
        if(this.frameSets.length > 0){
			if (this.slicingDir === SliceDirection._3D) {
				this.computeMat4Perspective();
				this.computeMat4View3D();
			}
			else {
				this.computeMat4Model();
				this.computeMat4View();
				this.computeMat4Ortho();
			}
        }
	}
    
    /**
     * The function returns the value of the private variable `slicingDir`
     * @returns The slicing direction of the object.
     */
    get slicingDirection():SliceDirection{		
		return this.slicingDir;
	}

	/**
	 * The function returns the zoom level based on the slicing direction.
	 * @returns The `zoom` property is being returned, which is a number.
	 */
	get zoom(): number {
		return this.scale[this.slicingDir];
	} 

	/**
	 * The function sets the zoom scale for a 3D or orthographic view and updates the corresponding
	 * matrix.
	 * @param {number} zoomScale - The `zoomScale` parameter is a number that represents the desired zoom
	 * level. It is used to adjust the scale of the object being displayed.
	 */
	set zoom(zoomScale: number) {
		this.scale[this.slicingDir] = clamp(zoomScale, this.minScale, this.maxScale);

		if (this.slicingDir === SliceDirection._3D) {
			this.computeMat4View3D();
		}
		else {
			this.computeMat4Ortho();
		}
	}

	/**
	 * The function returns the maximum zoom level.
	 * @returns The maxZoom value, which is of type number.
	 */
	get maxZoom(): number {
		return this.maxScale;
	}

	/**
	 * The function sets the maximum zoom level for a map.
	 * @param {number} max - The `max` parameter is a number that represents the maximum zoom level or
	 * scale that can be set for a particular object or element.
	 */
	set maxZoom(max: number) {
		this.maxScale = max;
	} 

	/**
	 * The function returns the minimum zoom level as a number.
	 * @returns The minimum zoom level, represented as a number.
	 */
	get minZoom(): number {
		return this.minScale;
	}

	/**
	 * The function sets the minimum zoom level for a map.
	 * @param {number} min - The "min" parameter is a number that represents the minimum zoom level or
	 * scale that can be set for a particular object or element.
	 */
	set minZoom(min: number) {
		this.minScale = min;
	} 

	/**
	 * This function pans the camera by the given amount in millimeters.
	 * @param {number} mmDeltaX - The amount to pan in the X direction in millimeters.
	 * @param {number} mmDeltaY - The amount to pan in the Y direction in millimeters.
	 */
	pan(mmDeltaX: number, mmDeltaY: number) {
		this.deltaL[this.slicingDir] += mmDeltaX;
		this.deltaR[this.slicingDir] += mmDeltaX;
		this.deltaB[this.slicingDir] += mmDeltaY;
		this.deltaT[this.slicingDir] += mmDeltaY;

		if (this.slicingDir === SliceDirection._3D) {
			this.computeMat4View3D();
		}
		else {
			this.computeMat4Ortho();
		}
	}

	/**
	 * The `orbit` function updates the view matrix to rotate the 3D scene based on the given delta values
	 * for the X and Y axes.
	 * @param {number} deltaX - The `deltaX` parameter represents the change in the x-axis rotation for
	 * the orbit. It determines how much the object will rotate around the y-axis.
	 * @param {number} deltaY - The parameter `deltaY` represents the change in the y-axis rotation angle
	 * for the orbit function. It is used to update the orbit angle and apply rotation to the view matrix.
	 * @returns Nothing is being returned in this code snippet. It is a method that performs some
	 * calculations and updates the state of the object it belongs to, but it does not return any value.
	 */
	orbit(deltaX: number, deltaY: number) {
		if (this.slicingDir !== SliceDirection._3D) return;

		// update the orbit angle
		this.orbitAngle[0] += deltaX;
		this.orbitAngle[1] += deltaY;

		this.computeMat4View3D();
	}

	/**
	 * The function resets the values of the delta variables to zero and then calls the function that
	 * computes the orthographic projection matrix
	 */
	reset() {
		this.deltaB[this.slicingDir] = 0;
		this.deltaT[this.slicingDir] = 0;
		this.deltaL[this.slicingDir] = 0;
		this.deltaR[this.slicingDir] = 0;
		this.scale[this.slicingDir] = 1;
		this.orbitAngle = [0,0];

		if (this.slicingDir === SliceDirection._3D) {
			this.computeMat4View3D();
		} 
		else {
			this.computeMat4Ortho(); 
		}
	}
	//------------------------------------------------------------------------------

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
		this.program = null;
		this.image = null;
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

/**
 * The clamp function returns a value that is clamped between a minimum and maximum value.
 * @param {number} x - The value that you want to clamp between the minimum and maximum values.
 * @param {number} min - The `min` parameter represents the minimum value that `x` can be.
 * @param {number} max - The `max` parameter represents the maximum value that the `x` parameter can
 * be.
 * @returns a number.
 */
function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(x, max));
}

export default Renderer;