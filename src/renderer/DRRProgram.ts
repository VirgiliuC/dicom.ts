import * as twgl from "twgl.js";
import { ProgramInfo, BufferInfo } from "twgl.js";

import raw from "raw.macro";
import FrameInfo from "../image/FrameInfo";
import IProgram, {IDrawObject, Uniforms, preCompileGreyscaleShader } from "./Program";
import { IDisplayInfo } from "../image/DisplayInfo";
import { AABB } from "../parser/AABB";

const vertexDRRShader = raw("./vertexDRR.glsl");
const drrShader = raw("./drr.glsl");
const vertexShader = `
#version 300 es

precision highp float;
uniform mat4 u_matrix_proj;
uniform mat4 u_matrix_panzoom;
uniform mat4 u_matrix_view;
in vec3 position;

void main() {
    gl_Position = u_matrix_proj * u_matrix_panzoom * u_matrix_view * vec4(position, 1);
}
`;
const aabbShader = `
#version 300 es

precision highp float;

layout(location = 0) out vec4 out_0;

uniform vec4 u_edge_color;

void main(void){
    out_0 = u_edge_color;
}
`;

//======================================================================================
/* It creates a WebGL program that draws a unit quad, and uses a fragment shader to color it based on
the texture */
class DRRProgram implements IProgram {
	programInfo: ProgramInfo;
    aabbProgramInfo: ProgramInfo;

	unitQuadBufferInfo: BufferInfo;

	gl:WebGL2RenderingContext;

	static programStringForInfo(info: IDisplayInfo): string {
		return preCompileGreyscaleShader(info, drrShader);
	}

	// don't need info! all non palette color images use same program
	constructor(gl:WebGL2RenderingContext, info: IDisplayInfo) {
		const drrShaderString = DRRProgram.programStringForInfo(info);
		const programInfo = twgl.createProgramInfo(gl, [vertexDRRShader, drrShaderString]);
		
		/* build a normalized unit quad as a 3D geometry, which will be transformed as required*/		
		const arrays = {			
			position: [-1,-1,-1,  1,-1,-1,  1,1,-1,  -1,1,-1],
			indices: [0,1,2,0,2,3]
		}
		this.unitQuadBufferInfo =  twgl.createBufferInfoFromArrays(gl, arrays);

		this.programInfo = programInfo;
        this.aabbProgramInfo = twgl.createProgramInfo(gl, [vertexShader, aabbShader]);
		this.gl = gl;
	}
	
    makeDrawObject(frame: FrameInfo): Promise<IDrawObject> {
        return {} as any;
    }

	async makeDrawObjects(frame: FrameInfo, sharedUniforms: Uniforms, patAABB: AABB) : Promise<Array<IDrawObject>> {
		const {
			programInfo,
			unitQuadBufferInfo,
		} = this;
		const {
            image,
            signed,
            slope,
            intercept,
            modulationColor,
            maxPixVal,
            minPixVal,
            bitsAllocated
		} = frame.imageInfo;
		const { texture, frameNo } = frame;

        let {
            windowCenter,
            windowWidth
        } = frame.imageInfo;
		
		const imgSize = frame.imageInfo.size;
		const nFrames:number = frame.imageInfo.nFrames;

        if (!windowWidth && (maxPixVal !== null || minPixVal !== null)) {
			windowWidth = Math.abs((maxPixVal ?? 0) - (minPixVal ?? 0));
			windowCenter = ((maxPixVal || 0) + (minPixVal || 0)) / 2;
		}
		if (signed) {
			windowCenter = (windowCenter || 0) + (2 ** (bitsAllocated - 1));
		}

        // let scaling = 1;
        // let shift = 0;
        // let typeMin = 0;
        // let typeMax = 65535;

        // if (signed) {
        //     scaling = 2;
        //     shift = -1;
        //     typeMin = 32767;
        //     typeMax = -32768;
        // }

        // const hfMax = typeMax * slope + intercept;
        // const hfMin = typeMin * slope + intercept;
        // const range = hfMax - hfMin;

        // const scaledAir = ((-950 - hfMin) / range) * scaling + shift;
        // const scaledWindow = ((windowWidth || 0) / range) * scaling;
        // const scaledCenter = (((windowCenter || 0) - hfMin) / range) * scaling + shift;

        // length of diagonal of AABB
        const length = twgl.v3.distance(patAABB.minCorner(), patAABB.maxCorner());
        let minCorner: twgl.v3.Vec3 = [-length/2,-length/2,patAABB.minCorner()[2]];
        let maxCorner: twgl.v3.Vec3 = [+length/2,+length/2,patAABB.maxCorner()[2]];

        // size of box
        const size = Math.floor(length);
        const sliceInterval = length/size;
        const nSlices = size+1;
        const z0 = patAABB.minCorner()[2];

        // create data and indices
        let data: number[] = [];
        let indices = [];

        for (let i = 1; i < nSlices; i++) {
            data.push(...this.createPlane(minCorner, maxCorner, z0+(i*sliceInterval)));
            // indice offset
            const j = (i-1)*4;
            let planeIndices = [0+j,1+j,2+j,0+j,2+j,3+j];
            indices.push(...planeIndices);
        }

        // create buffer info
        const bufferInfo = twgl.createBufferInfoFromArrays(this.gl, {
            position: {
                data: new Float32Array(data),
                numComponents: 3,
            },
			indices: new Uint16Array(indices),
        });


		const specificUniforms = {
			// volumeTexture: texture,
			// depth: nFrames,
            // height: imgSize.height,
            // window: scaledWindow,
            // centre: scaledCenter,
            // airThreshold: scaledAir,
            // drrEnable: 1.0,
			u_frameNo: frameNo,
			u_matrix_pat2pix: twgl.m4.inverse(frame.mat4Pix2Pat),
			u_resolution: [imgSize.width, imgSize.height, nFrames],
			u_texture: texture,
			u_winWidth: windowWidth,
			u_winCenter: windowCenter,
			u_slope: slope,
			u_intercept: intercept,
			u_modulation: modulationColor,
            u_num_slices: 1/nSlices
		};

        // AABB tool
        const min = patAABB.minCorner();
        const max = patAABB.maxCorner();
        const vertices = [
            min[0],min[1],max[2], // back bottom left
            max[0],min[1],max[2], // back bottom right
            max[0],min[1],min[2], // front bottom right
            min[0],min[0],min[2], // front bottom left
            min[0],max[1],max[2], // back top left
            max[0],max[1],max[2], // back top right
            max[0],max[1],min[2], // front top right
            min[0],max[1],min[2] // front top left
        ];
        const aabbIndices = [
            0,1,
            1,2,
            2,3,
            3,0,
            4,5,
            5,6,
            6,7,
            7,4,
            0,4,
            1,5,
            2,6,
            3,7,
        ]

        const aabbUniforms = {
            u_edge_color: [0.0,0.0,1.0,1.0]
        }
        //====================================================

		return [
            { // drr image
                active: true,
                programInfo,
                bufferInfo: bufferInfo,
                uniforms: [specificUniforms],
                type: this.gl.TRIANGLES,
            },
            { // aabb
                active: true,
                programInfo: this.aabbProgramInfo,
                bufferInfo: twgl.createBufferInfoFromArrays(this.gl, { position: vertices, indices: aabbIndices }),
                uniforms: [aabbUniforms],
                type: this.gl.LINES
            }
        ]
	}

    private createPlane(min: number[], max: number[], z: number): number[] {
        return [
            min[0],min[1],z, // bottom left
            max[0],min[1],z, // bottom right
            max[0],max[1],z, // top right
            min[0],max[1],z, // top left
        ];
    }

	destroy() {
		this.gl.deleteProgram(this.programInfo.program);
	}
}

export default DRRProgram;
