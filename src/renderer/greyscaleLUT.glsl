#version 300 es

precision highp float;

in vec3 texcoord;

layout(location = 0) out vec4 out_0;

uniform highp sampler3D u_texture;
uniform highp sampler2D u_lutTexture;
uniform float u_lutWidth;
uniform float u_firstInputValue;
uniform float u_maxValue;
uniform vec4  u_modulation;
uniform float u_frameNo;

float greyscale(vec4 color) {
	$(word)
}

void main() {
	/* check to see if the texture coordinates are all in the valid range, or abort otherwise*/
	const vec3 vzero = vec3(0.0,0.0,0.0);
	const vec3 vone = vec3(1.0,1.0,1.0);
	if(step(vzero, texcoord) != vone || step(texcoord, vone) != vone)
		discard;

	float grey = greyscale(texture(u_texture, texcoord));
	// $(pixelPadding)
	float lutPos = (max(u_firstInputValue, grey) - u_firstInputValue);
	grey = greyscale(texture(u_lutTexture, vec2(lutPos / u_lutWidth, 0.5))) / u_maxValue;
	// $(shouldInvert)
	gl_FragDepth = gl_FragCoord.z - (0.005 * u_frameNo);
	out_0 = vec4(grey, grey, grey, 1.0)*u_modulation;
}
