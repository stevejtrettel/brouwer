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


//takes in a real number theta (in 0,2pi) and a point in the disk (obj with coords {r:1,theta:2})
//outputs a Vector3
const parametricTorus = (theta,disk,dest=new Vector3()) => {

    //give the torus a size:
    const Rad = 2;

    //name the disk coordinates
    let r = disk.r;
    let phi = disk.theta;

    //point in the disk
    let diskPt = dest.set(r*Math.cos(phi),r*Math.sin(phi),0);
    //move the disk off to the side
    diskPt.x += Rad;

    //rotate around by theta
    dest = rotateY(dest,theta);
    return dest;

}


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

    let R = r+Math.sin(theta)/5.;
    R = Math.atanh(R/1.5);
    let T = theta-2*Math.sin(2*theta);

    return {r:R,theta:T};

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
            color:0x95d5de,
                //0xacd1e3,
                //0xd1dde3,
            transparent:true,
            opacity:1,
            clearcoat:2,
            ior:1.01,
            transmission:0.95,
            side:DoubleSide,
            roughness:0,
        });
        let torusGeom = new ParametricGeometry(torusEqn, 64,64)
        this.torusMesh = new Mesh(torusGeom, glassMat);
        this.add(this.torusMesh);


        this.params = {
            r:0.5,
        }



        //make the graph of the identity
        const idCurve = torusGraph(id,1);
        const idGeom = new TubeGeometry(idCurve, 128,0.1,16,true);
        const idMat = new MeshPhysicalMaterial({color:0xb5504c,clearcoat:1});
        this.idMesh = new Mesh(idGeom,idMat);
        this.add(this.idMesh);


        //make the graph of f
        const fCurve = torusGraph(f,this.params.r);
        const fGeom = new TubeGeometry(fCurve, 128,0.1,16,true);
        const fMat = new MeshPhysicalMaterial({color:0xb5504c,clearcoat:1});
        this.fMesh = new Mesh(fGeom,fMat);
        this.add(this.fMesh);

    }

    updateGraph(r){
        this.fMesh.geometry.dispose();
        const fCurve = torusGraph(f,this.params.r);
        this.fMesh.geometry = new TubeGeometry(fCurve, 128,0.1,16,true);
    }


    addToUI(ui){
        ui.add(this.params,'r',0,1,0.01).onChange(value =>{
            this.updateGraph(value);
        });
    }

}
