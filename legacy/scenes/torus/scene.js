import {
    Vector3,
    Mesh,
    MeshPhysicalMaterial,
    Group,
    DoubleSide, CatmullRomCurve3, TubeGeometry
} from "three";

import {ParametricGeometry} from "three/addons";




function rotateY(v, theta) {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const x = v.x * cos + v.z * sin;
    const z = -v.x * sin + v.z * cos;

    // mutate the vector in place
    v.x = x;
    v.z = z;
    return v;
}


// parametric torus point:
//  - theta: rotation angle around Y (any real number)
//  - disk:  either { r, theta } in polar coords or { x, y } in cartesian (unit disk)
//  - dest:  Vector3 to write into (optional)
const parametricTorus = (theta, disk, dest = new Vector3()) => {
    const Rad = 2; // torus major radius

    // figure out (x, y) on the unit disk
    let x, y;

    if ("r" in disk && "theta" in disk) {
        // polar input
        const r = disk.r;
        const phi = disk.theta;
        x = r * Math.cos(phi);
        y = r * Math.sin(phi);
    } else if ("x" in disk && "y" in disk) {
        // cartesian input
        x = disk.x;
        y = disk.y;
    } else {
        throw new Error("disk must be {r, theta} or {x, y}");
    }

    // embed the disk in 3D: shift by Rad along +X
    dest.set(x + Rad, y, 0);

    // rotate around Y by theta (assumes your rotateY(v, angle) mutates & returns v)
    return rotateY(dest, theta);
};


//takes in a function f:D->D and a radius r
//returns a threejs Curve() tracing the graph of fr in the solid torus
const torusGraph = (f,r)=>{
    const pts = [];
    for(let i=0;i<128; i++){
        const theta = 2*Math.PI*i/128;
        const input = {r:r,theta:theta};
        const output = f(input);
        const point = parametricTorus(theta,output);
        pts.push(point);
    }
    return new CatmullRomCurve3(pts);
}




//example function

const f = function(diskPt){
    const r = diskPt.r;
    const theta = diskPt.theta;

    let x1 = r*Math.cos(theta);
    let y1 = r*Math.sin(theta);

    let R2 = r*r;
    let T2 = 2*theta;
    let x2 = R2*Math.cos(T2);
    let y2 = R2*Math.sin(T2);

    let R3 = r*r*r;
    let T3 = 3*theta;
    let x3 = R3*Math.cos(T3);
    let y3 = R3*Math.sin(T3);

    let R4 = r*r*r*r;
    let T4 = 4*theta;
    let x4 = R4*Math.cos(T4);
    let y4 = R4*Math.sin(T4);

    let x = x4/4+x3/3+x2/2-x1+0.1;
    let y = y4/4+y3/3+y2/2-y1+0.2;

    return {x:x/1.5,y:y/1.5};

    // let R =0.8*r+Math.sin(r*theta)/5;
    // R = Math.atanh(R/1.5);
    // let T = theta;
    //
    //
    // //add in a small constant term
    // R += 0.5;
    // //T += 0.3;
    //
    // return {r:R,theta:T};

}

const id = function(diskPt){
    return {r:diskPt.r,theta:diskPt.theta};
}



export default class TorusScene extends  Group{
    constructor() {
        super();


        const torusEqn = (u,v,dest=new Vector3())=>{
            const U = 2*Math.PI*u;
            const V = 2*Math.PI*v;

            const x = (2+Math.cos(U))*Math.cos(V);
            const y = (2+Math.cos(U))*Math.sin(V);
            const z = Math.sin(U);

            dest.set(x,z,-y);
            return dest;
        }

        let glassMat = new MeshPhysicalMaterial({
            color:0xd1dde3,
                //0xacd1e3,
                //0xd1dde3,
            transparent:true,
            opacity:1,
            clearcoat:1,
            ior:1.01,
            transmission:0.99,
            side:DoubleSide,
            roughness:0,
        });
        let torusGeom = new ParametricGeometry(torusEqn, 64,64)
        this.torusMesh = new Mesh(torusGeom, glassMat);
        this.add(this.torusMesh);


        this.params = {
            r:1,
        }



        //make the graph of the identity
        const idCurve = torusGraph(id,1);
        const idGeom = new TubeGeometry(idCurve, 128,0.075,16,true);
        const idMat = new MeshPhysicalMaterial({color:0xb5504c,clearcoat:1,metalness:0,roughness:0.1});
        this.idMesh = new Mesh(idGeom,idMat);
        this.add(this.idMesh);


        //make the graph of f
        const fCurve = torusGraph(f,this.params.r);
        const fGeom = new TubeGeometry(fCurve, 128,0.075,16,true);
        const fMat = new MeshPhysicalMaterial({color:0x475fd6,clearcoat:1,metalness:0,roughness:0.1});
        this.fMesh = new Mesh(fGeom,fMat);
        this.add(this.fMesh);

    }

    updateGraph(r){
        this.fMesh.geometry.dispose();
        const fCurve = torusGraph(f,this.params.r);
        this.fMesh.geometry = new TubeGeometry(fCurve, 128,0.075,16,true);


        this.idMesh.geometry.dispose();
        const idCurve = torusGraph(id,this.params.r);
        this.idMesh.geometry= new TubeGeometry(idCurve, 128,0.075,16,true);
    }


    addToUI(ui){
        ui.add(this.params,'r',0,1,0.01).onChange(value =>{
            this.updateGraph(value);
        });
    }

}
