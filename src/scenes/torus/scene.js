import {
    Vector3,
    Mesh,
    MeshPhysicalMaterial,
    Group,
    DoubleSide, CatmullRomCurve3, TubeGeometry
} from "three";

import {ParametricGeometry} from "three/addons";




export default class TorusScene extends  Group{
    constructor() {
        super();

        this.r = 1;
        this.R = 2;

        this.torusEqn = (u,v,dest=new Vector3())=>{
            const U = 2*Math.PI*u;
            const V = 2*Math.PI*v;

            const x = (this.R+this.r*Math.cos(U))*Math.cos(V);
            const y = (this.R+this.r*Math.cos(U))*Math.sin(V);
            const z = this.r*Math.sin(U);

            dest.set(x,z,-y);
            return dest;
        }

        let glassMat = new MeshPhysicalMaterial({
            color:0xacd1e3,
                //0xd1dde3,
            transparent:true,
            opacity:1,
            clearcoat:3,
            ior:1.01,
            transmission:0.95,
            side:DoubleSide,
        });
        let torusGeom = new ParametricGeometry(this.torusEqn, 64,64)


        this.add(new Mesh(torusGeom, glassMat));

        let curvePts = [];
        for(let i=0;i<100;i++){
            const t = i/100;
            curvePts.push(this.torusEqn(t,t).clone());
        }
        let curve = new CatmullRomCurve3(curvePts);
        let curveGeo = new TubeGeometry(curve,128,0.1,16,true);
        let curveMat = new MeshPhysicalMaterial({color:0xb5504c,clearcoat:1});
        let curveMesh = new Mesh(curveGeo, curveMat);

        this.add(curveMesh);



        const solidTorus = (phi, R, theta)=>{
            const x = (this.R+R*Math.cos(theta))*Math.cos(phi);
            const y = (this.R+R*Math.cos(theta))*Math.sin(phi);
            const z = R*Math.sin(theta);
            return new Vector3(x,z,-y);
        }


        const rT = (t) => {
            //return 0.3;
            return 0.3+0.2*Math.sin(3*t);
        }
        const thetaT = (t)=>{return 3*t;}

        let corePts = [];
        for(let i=0;i<100;i++){
            const t =2*Math.PI* i/100;
            corePts.push(solidTorus(t,rT(t),thetaT(t)));
            //new Vector3(2*Math.cos(t),0,2*Math.sin(t))
        }
        let coreCurve = new CatmullRomCurve3(corePts);
        let coreGeo = new TubeGeometry(coreCurve,256,0.1,16,true);
        let coreMat = new MeshPhysicalMaterial({color:0x536cb8,clearcoat:1});
        let coreMesh = new Mesh(coreGeo, coreMat);

        this.add(coreMesh);


    }

}
