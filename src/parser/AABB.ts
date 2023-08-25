import { v3, m4 } from 'twgl.js';

export class AABB {
    private min: v3.Vec3 = v3.create();
    private max: v3.Vec3 = v3.create();

    /**
     * The constructor takes two points and a displacement value. It then sets the minimum and maximum
     * values of the bounding box to the first point. It then checks to see if the second point is
     * greater than the first point in each dimension. If it is, it sets the maximum value to the
     * second point. If it isn't, it sets the minimum value to the second point. It then adds the
     * displacement value to the maximum values and subtracts the displacement value from the minimum
     * values
     * @param pt1 - The first point of the bounding box.
     * @param pt2 - v3.Vec3, displace: number = 0
     * @param {number} [displace=0] - This is the amount of space to add to the bounding box.
     */
    constructor(pt1?: v3.Vec3, pt2?: v3.Vec3, displace: number = 0) {
        if (pt1 === undefined || pt2 === undefined) {
            this.setNull();
            return;
        }

        this.max = pt1;
        this.min = pt2;

        if (this.max[0] < pt2[0]) this.max[0] = pt2[0];
        if (this.max[1] < pt2[1]) this.max[1] = pt2[1];
        if (this.max[2] < pt2[2]) this.max[2] = pt2[2];
        if (this.min[0] > pt2[0]) this.min[0] = pt2[0];
        if (this.min[1] > pt2[1]) this.min[1] = pt2[1];
        if (this.min[2] > pt2[2]) this.min[2] = pt2[2];

        this.max[0] = this.max[0] + displace;
        this.max[1] = this.max[1] + displace;
        this.max[2] = this.max[2] + displace;

        this.min[0] = this.min[0] - displace;
        this.min[1] = this.min[1] - displace;
        this.min[2] = this.min[2] - displace;
    }

    /**
     * > If the first AABB is null, return the second AABB. If the second AABB is null, return the
     * first AABB. Otherwise, add the first AABB's min and max points to the second AABB and return the
     * second AABB
     * @param {AABB} aabb1 - The first AABB to add.
     * @param {AABB} aabb2 - The AABB that will be returned.
     * @returns AABB
     */
    static addAABB(aabb1: AABB, aabb2: AABB): AABB {
        if (aabb1.isNull())
            return aabb2;
        if (aabb2.isNull())
            return aabb1;

        let tmp: AABB = new AABB(aabb2.max, aabb2.min);
        tmp.addPoint(aabb1.min);
        tmp.addPoint(aabb1.max);
        return tmp;
    }

    /**
     * "Add a point to an AABB."
     * 
     * The first line is a comment. It's a good idea to add comments to your code
     * @param {AABB} aabb - AABB - The AABB to add the vector to.
     * @param v - v3.Vec3 - The vector to add to the AABB.
     * @returns A new AABB with the point added.
     */
    static addVec(aabb: AABB, v: v3.Vec3): AABB {
        let tmp = aabb;
        tmp.addPoint(v);
        return tmp;
    }

    /**
     * It sets the min and max values to the opposite of each other.
     */
    setNull(): void {
        this.min = v3.create(1, 1, 1);
        this.max = v3.create(-1,-1,-1);
    }

    /**
     * If the minimum value of any of the three dimensions is greater than the maximum value of that
     * dimension, then the box is null
     */
    isNull(): boolean {
        return (
            this.min[0] > this.max[0] || 
            this.min[1] > this.max[1] || 
            this.min[2] > this.max[2]
        );
    }

    /**
     * If the minimum and maximum points are the same, then this is a point.
     * @returns A boolean value.
     */
    isPoint(): boolean {
        return (
            this.min[0] === this.max[0] && 
            this.min[1] === this.max[1] && 
            this.min[2] === this.max[2]
        );
    }

    /**
     * Enlarge the bounding box by a given amount
     * @param {number} displace - The amount to enlarge the bounding box by.
     * @returns the center of the bounding box.
     */
    enlarge(displace: number): void {
        if (this.isNull())
            return;
        
        this.max[0] = this.max[0] + displace;
        this.max[1] = this.max[1] + displace;
        this.max[2] = this.max[2] + displace;

        this.min[0] = this.min[0] - displace;
        this.min[1] = this.min[1] - displace;
        this.min[2] = this.min[2] - displace;
    }

    /**
     * Enlarge the bounding box by a given amount in the x direction
     * @param {number} displace - The amount to enlarge the bounding box by.
     * @returns the center of the bounding box.
     */
    enlargeX(displace: number): void {
        this.min[0] = this.min[0] - displace;
        this.max[0] = this.max[0] + displace;
    }

    /**
     * Enlarge the bounding box by a given amount in the y direction
     * @param {number} displace - The amount to enlarge the bounding box by.
     * @returns the center of the bounding box.
     */
    enlargeY(displace: number): void {
        this.min[1] = this.min[1] - displace;
        this.max[1] = this.max[1] + displace;
    }

    /**
     * Enlarge the bounding box by a given amount in the z direction
     * @param {number} displace - The amount to enlarge the bounding box by.
     * @returns the center of the bounding box.
     */
    enlargeZ(displace: number): void {
        this.min[2] = this.min[2] - displace;
        this.max[2] = this.max[2] + displace;
    }

    /**
     * If the maximum x value of the first AABB is less than the minimum x value of the second AABB,
     * then the AABBs do not intersect
     * @param {AABB} aabb - AABB - The AABB to check for intersection with.
     * @returns A boolean value.
     */
    intersects(aabb: AABB): boolean {
        if (this.isNull() || aabb.isNull())
            return false;
        
        if (this.max[0] < aabb.min[0])
            return false;

        if (this.max[1] < aabb.min[1])
            return false;

        if (this.min[0] > aabb.max[0])
            return false;

        if (this.min[1] > aabb.max[1])
            return false;

        return true;
    }

    /*Calculates the intersection between this AABB and the given one,
    and returns it as a new AABB (which could be null if they don't intersect)*/
    intersection(aabb: AABB): AABB {
        if (!this.intersects(aabb))          
            return new AABB();//return a null one

        let   imin: v3.Vec3;
        let   imax: v3.Vec3;
        
        imin = this.clip(aabb.minCorner());
        imax = this.clip(aabb.maxCorner());

        return new AABB(imin,imax);
    }

    /**
     * If the box is not null, then clip the vector to the box
     * @param v - v3.Vec3 - The vector to clip
     * @param {boolean} [clipx=true] - boolean=true
     * @param {boolean} [clipy=true] - boolean=true
     * @param {boolean} [clipz=true] - boolean=true
     * @returns A new vector with the values clipped to the min and max values of the bounding box.
     */
    clip(v: v3.Vec3, clipx: boolean=true, clipy: boolean=true, clipz: boolean=true): v3.Vec3 {
        if (this.isNull()) 
            return v;
        
        let tmp = v;

        if (clipx) {
            if (v[0] > this.max[0]) 
                tmp[0] = this.max[0];
            else
            if (v[0] < this.min[0])
                tmp[0] = this.min[0];
        }

        if (clipy) {
            if (v[1] > this.max[1]) 
                tmp[1] = this.max[1];
            else
            if (v[1] < this.min[1])
                tmp[1] = this.min[1];
        }

        if (clipz) {
            if (v[2] > this.max[2]) 
                tmp[2] = this.max[2];
            else
            if (v[2] < this.min[2])
                tmp[2] = this.min[2];
        }

        return tmp;
    }

    /**
     * `isInside` returns true if the given point is inside the box, or on the box if the optional
     * parameters are set to true
     * @param v - v3.Vec3 - The vector to check if it's inside the box.
     * @param {boolean} [clipx] - if true, the x coordinate of the vector will be clipped to the box's
     * x range.
     * @param {boolean} [clipy] - if true, the y-coordinate of the vector will be clipped to the box's
     * y-range.
     * @param {boolean} [clipz] - if true, the z-coordinate of the vector will be clipped to the
     * z-coordinate of the box.
     */
    isInside(v: v3.Vec3, clipx?: boolean, clipy?: boolean, clipz?: boolean): boolean {
        if (clipx === undefined) {
            return (
                v[0] >= this.minCorner()[0] && v[0] <= this.maxCorner()[0] &&
                v[1] >= this.minCorner()[1] && v[1] <= this.maxCorner()[1] &&
                v[2] >= this.minCorner()[2] && v[2] <= this.maxCorner()[2] 
            );
        }

        let t = v;
        return v == this.clip(t, clipx, clipy, clipz);
    }

    /**
     * > Returns the width of the bounding box
     * @returns The width of the bounding box.
     */
    width(): number {
        if (this.isNull())  
            return 0;
        else
            return this.max[0] - this.min[0];
    }

    /**
     * > Returns the height of the bounding box
     * @returns The height of the bounding box.
     */
    height(): number {
        if (this.isNull())  
            return 0;
        else
            return this.max[1] - this.min[1];        
    }

    /**
     * > Returns the depth of the bounding box
     * @returns The depth of the box.
     */
    depth(): number {
        if (this.isNull())  
            return 0;
        else
            return this.max[2] - this.min[2];        
    }

    /**
     * `equals` returns true if the `min` and `max` of the current `AABB` are equal to the `min` and
     * `max` of the `AABB` passed in as a parameter
     * @param {AABB} aabb - AABB - The AABB to compare to.
     * @returns A boolean value.
     */
    equals(aabb: AABB): boolean {
        return (
            this.min === aabb.min && 
            this.max === aabb.max
        );
    }

    /**
     * Returns true if the two AABBs are not equal, false otherwise
     * @param {AABB} aabb - AABB - The AABB to compare to.
     * @returns A boolean value.
     */
    notEquals(aabb: AABB): boolean {
        return !this.equals(aabb);
    }

    /**
     * The function returns a new AABB that is the result of adding the two AABBs together
     * @param {AABB} aabb - AABB - The AABB to add to this AABB.
     * @returns The result of the addition of the two AABBs.
     */
    addAABB(aabb: AABB): AABB {
        const result = AABB.addAABB(this, aabb);
        this.min = result.min;
        this.max = result.max;
        return result;
    }

    /**
     * "Add a vector to the AABB."
     * 
     * The first line is the function signature. It's a function named addVec that takes a single
     * parameter named v. The parameter is a vector. The function returns an AABB
     * @param v - v3.Vec3 - The vector to add to the AABB.
     * @returns The AABB itself.
     */
    addVec(v: v3.Vec3): AABB {
        this.addPoint(v);
        return this;
    }

    /**
     * If the bounding box is null, set the min and max to the point. Otherwise, if the point is
     * outside the bounding box, expand the bounding box to include the point.
     * @param p - v3.Vec3 - The point to add to the bounding box.
     * @returns The center of the bounding box.
     */
    addPoint(p: v3.Vec3): void {
        if (this.isNull()) {
            this.max = p;
            this.min = p;
            return;
        }

        let resMax = [...this.max];
        let resMin = [...this.min];

        if (this.max[0] < p[0]) resMax[0] = p[0];
        if (this.max[1] < p[1]) resMax[1] = p[1];
        if (this.max[2] < p[2]) resMax[2] = p[2];
        if (this.min[0] > p[0]) resMin[0] = p[0];
        if (this.min[1] > p[1]) resMin[1] = p[1];
        if (this.min[2] > p[2]) resMin[2] = p[2];

        this.min = resMin;
        this.max = resMax;
    }

    /**
     * It returns the center of the box.
     * @returns The center of the box.
     */
    center(): v3.Vec3 {
        let c = v3.divScalar(v3.add(this.minCorner(), this.maxCorner()), 2);
        return c;
    }

    /**
     * It returns the longest side length of the box
     * @returns The longest side length of the box.
     */
    longestSideLength(): number {
        let side = this.width();

        if (this.height() > side) 
            side = this.height();
        if (this.depth() > side)
            side = this.depth();
        
        return side;
    }

    /**
     * "Transform the AABB by the given matrix and return the result in the given output AABB."
     * 
     * The first thing we do is create a temporary AABB called `tmp`. We then check if the AABB is
     * null. If it is, we return the null AABB. If it isn't, we create two vectors, `min` and `max`,
     * which are the minimum and maximum corners of the AABB. We then transform the eight corners of
     * the AABB by the given matrix and add them to the output AABB
     * @param {AABB} out - The output AABB.
     * @param mat - The matrix to transform the AABB by.
     * @returns AABB
     */
    transformed(out: AABB, mat: m4.Mat4): AABB {
        let tmp = out;

        tmp.setNull();
        if (!this.isNull()) {
            const min = this.minCorner();
            const max = this.maxCorner();

            tmp.addPoint(m4.transformPoint(mat, v3.create(min[0], min[1], min[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(min[0], max[1], min[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(max[0], max[1], min[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(max[0], min[1], min[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(min[0], min[1], max[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(min[0], max[1], max[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(max[0], max[1], max[2])));
            tmp.addPoint(m4.transformPoint(mat, v3.create(max[0], min[1], max[2])));
        }

        return tmp;
    }

    /**
     * Returns the minimum corner of the box.
     * @returns A Vec3 object.
     */
    minCorner(): v3.Vec3 {
        return this.min;
    }

    /**
     * Returns the maximum corner of the bounding box.
     * @returns The maximum corner of the bounding box.
     */
    maxCorner(): v3.Vec3 {
        return this.max;
    }

    /**
     * Sets the minimum corner of the box.
     * @param {number} x - The x-coordinate of the minimum corner of the bounding box.
     * @param {number} y - number
     * @param {number} z - number - The z-coordinate of the minimum corner of the bounding box.
     */
    setMinCorner(x: number, y: number, z: number): void {
        this.min[0] = x;
        this.min[1] = y;
        this.min[2] = z;
    }

    /**
     * Sets the maximum corner of the bounding box.
     * @param {number} x - The x-coordinate of the maximum corner of the bounding box.
     * @param {number} y - number
     * @param {number} z - number - The z-coordinate of the bounding box.
     */
    setMaxCorner(x: number, y: number, z: number): void {
        this.max[0] = x;
        this.max[1] = y;
        this.max[2] = z;
    }

    /**
     * Returns the volume of the AABB.
     * @returns The volume of the box.
     */
    volume(): number {
        return this.width() * this.height() * this.depth();
    }
}
