#version 300 es

precision highp float;

layout(location = 0) out vec4 out_0;

uniform highp sampler3D volumeTexture;
uniform float depth;
uniform float height;
// uniform float slice;
// uniform float heightSlice;
uniform float window;
uniform float centre;
uniform float airThreshold;
uniform float drrEnable;
uniform float u_frameNo;
//uniform mat4 u_matrix_view;
uniform float u_num_slices;

in vec3 texcoord;

void main(void){
    //vec3 eye_position = vec3(u_matrix_view[3][0], u_matrix_view[3][1], u_matrix_view[3][2]);
    float fragValue = texture(volumeTexture, texcoord).r;
    float valid = step(airThreshold, fragValue);
//                          step(centre - window / 2.0, fragValue) * \n\
//                          (1.0 - step(centre + window / 2.0, fragValue)) * \n\
                    // step(1.0, texcoord.z) * 
                    // step(1.0, texcoord.y);
    if(valid == 0.0)
        discard;
    //float x = eye_position.x;
    float normalFactor = drrEnable * depth;
    fragValue = ((fragValue - (centre - window / 2.0)) / window) / max(normalFactor, 1.0);
    fragValue = clamp(fragValue,0.0,1.0);

	gl_FragDepth = gl_FragCoord.z - (0.005 * u_frameNo);

    out_0 = vec4(fragValue,fragValue,fragValue,1.0*u_num_slices);
    // out_0 = vec4(random(vec2(0.0,1.0)),random(vec2(0.0,1.0)),random(vec2(0.0,1.0)),1.0);
}