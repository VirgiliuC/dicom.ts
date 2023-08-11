import { SliceDirection } from "../parser";
import Renderer from "./Renderer";
import * as twgl from 'twgl.js';

class Renderer2D extends Renderer {
	private deltaT: Array<number> = [0,0,0];
	private deltaB: Array<number> = [0,0,0];
	private deltaL: Array<number> = [0,0,0];
	private deltaR: Array<number> = [0,0,0];

    private slicingDir:SliceDirection = SliceDirection.Axial;

    constructor(inCanvas: HTMLCanvasElement | null) {
        super(inCanvas);
    }

	// zooming 
	private scale: Array<number> = [1,1,1];

    get zoom(): number {
		return this.scale[this.slicingDir];
	}

	set zoom(zoomScale: number) {
		this.scale[this.slicingDir] = (zoomScale <= 0) ? 0.01 : zoomScale;

		this.computeMat4Proj();
	}

	/**
	 * The function resets the values of the delta variables to zero and then calls the function that
	 * computes the orthographic projection matrix
	 */
	resetZoom() {
		this.scale[this.slicingDir] = 1;

		this.computeMat4Proj();
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

		this.computeMat4Proj();
	}

    /**
     * The function "resetPan" resets the delta values for panning in different directions and then
     * computes the projection matrix.
     */
    resetPan(): void {
		this.deltaB[this.slicingDir] = 0;
		this.deltaT[this.slicingDir] = 0;
		this.deltaL[this.slicingDir] = 0;
		this.deltaR[this.slicingDir] = 0;

        this.computeMat4Proj();
    }

    /**
     * This function sets up the WebGL viewport, clears the color buffer, blends and draws multiple
     * objects using different draw object arrays.
     */
    render(): void {
        const gl  = this.wgl2;        
        const viewport = this.outputSize;
        /* let's set the viewport as xo, yo, width, height respectively*/
        gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(viewport[0],viewport[1],viewport[2],viewport[3]);
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        /*here we will blend all the images according to their alpha (use modulation colour)*/
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        twgl.drawObjectList(gl, this.imgDrawObjectArray);
        twgl.drawObjectList(gl, this.toverlayDrawObjectArray);
        gl.disable(gl.BLEND);
        twgl.drawObjectList(gl, this.soverlayDrawObjectArray);
    }

    /**
     * The function computes an orthographic projection matrix based on the size and aspect ratio of
     * the images and the viewport.
     */
    protected computeMat4Proj(){
		const renderDir:number = this.slicingDir as number;

		const {mmPatMinAABB, mmPatMaxAABB} = this;
        let mat_ortho:twgl.m4.Mat4;    
		//----- Ortho Proj ----//
		const {outputSize} = this;
		const VW = outputSize[2];
		const VH = outputSize[3];
		const mmPatSize = twgl.v3.subtract(mmPatMaxAABB,mmPatMinAABB);
		if(mmPatSize[2] === 0) {
			mmPatSize[2] = mmPatSize[2] + 0.00;
		}
        const mmOffset = 0.05; //guard against degenerate case of single image
		const hW:number[] = [mmPatSize [1]/2,mmPatSize [0]/2,mmPatSize [0]/2];
		const hH:number[] = [mmPatSize [2]/2,mmPatSize [2]/2,mmPatSize [1]/2]; 
		const near:number = 0; 	
		const far:number  =  mmPatSize [renderDir]+1.0;

		const VAR = VW/VH;//viewport aspect ratio
		const OAR = (hW[renderDir])/(hH[renderDir]);//ortho projection aspect ratio
        /* we need to preserve the aspect ratio of the images, if viewport is different size=wise*/
		if(VAR > OAR){
			mat_ortho  = twgl.m4.ortho(
				(-hW[renderDir]*VAR/OAR)*this.zoom+this.deltaL[renderDir],
				(hW[renderDir]*VAR/OAR)*this.zoom+this.deltaR[renderDir],
				(-hH[renderDir])*this.zoom+this.deltaB[renderDir],
				(hH[renderDir])*this.zoom+this.deltaT[renderDir],
				near,far
			);
		}
		else{
			mat_ortho  = twgl.m4.ortho(
				(-hW[renderDir])*this.zoom+this.deltaL[renderDir],
				(hW[renderDir])*this.zoom+this.deltaR[renderDir],
				(-hH[renderDir]*OAR/VAR)*this.zoom+this.deltaB[renderDir],
				(hH[renderDir]*OAR/VAR)*this.zoom+this.deltaT[renderDir],
				near,far
			);
		};
		this.sharedUniforms.u_matrix_proj = mat_ortho;
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
		frameLoc[renderDir] 		= this.cutPoint[renderDir]-mmPatMinAABB[renderDir];
        
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
     * > When the user changes the slicing direction, we need to recompute the whole M-V-P matrix chain
     * @param {SliceDirection} slice_dir - SliceDirection
     */
    set slicingDirection(slice_dir: SliceDirection) {
		this.slicingDir = slice_dir;
		this.sharedUniforms.u_sliceDir = slice_dir;
        /* when we have images, renew the whole M-V-P matrix chain*/
        if(this.frameSets.length > 0){
            this.computeMat4Model();
            this.computeMat4View();
            this.computeMat4Proj();
        }
	}
    
    /**
     * The function returns the value of the private variable `slicingDir`
     * @returns The slicing direction of the object.
     */
    get slicingDirection():SliceDirection{		
		return this.slicingDir;
	}
}

export default Renderer2D;