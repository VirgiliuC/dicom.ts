#version 300 es

precision highp float;

uniform mat4 u_matrix_proj;
uniform mat4 u_matrix_view;
uniform mat4 u_matrix_panzoom;
uniform mat4 u_matrix_pat2pix;
uniform vec3 u_resolution;

in vec3 position;
out vec3 texcoord;

void main() {
    vec4 pixpos = u_matrix_pat2pix * inverse(u_matrix_view) * vec4(position, 1.0);//convert patient position to local pixel coords
    texcoord = 0.5/u_resolution + pixpos.xyz/ u_resolution;//derive local tex coords from pixel position
    gl_Position = u_matrix_proj * u_matrix_panzoom * vec4(position, 1.0);
}