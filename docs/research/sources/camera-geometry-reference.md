<!-- source: https://epicgames.ent.box.com/s/wggtlm378ru7opdl9hrf574vc2b1opt1
     (PDF "On the Coordinate Systems Employed in the Import, Estimation, and Export of
     Camera Geometry by RealityScan.pdf", Michael Hornacek, RealityScan, June 8, 2026;
     41 pages; linked client-side from
     https://dev.epicgames.com/documentation/en-us/realityscan/camera-geometry-in-realityscan-camera-models-and-coordinate-systems-reference)
     http: 200
     fetched: 2026-09-19T06:41:26Z
     extracted from PDF with `pdftotext -layout`; wording verbatim, math/figure layout lost -->

     On the Coordinate Systems Employed in the
      Import, Estimation, and Export of Camera
              Geometry by RealityScan
                                Michael Hornáček
                                  RealityScan
                                   June 8, 2026


1    Overview
The aim of this document is to provide a rigorous introduction to the camera models
and associated coordinate systems employed by RealityScan as part of the import,
estimation, and export of camera geometry. Section 2 addresses preliminaries, intro-
ducing notational conventions and a brief excursion in the representation of points,
3D rotations, and 3D rigid body transformations made use of in this document.
As is the norm in computer vision, it is in terms of the frontal pinhole camera
model that RealityScan represents the cameras estimated during alignment; it is in
Section 3 that the (frontal) pinhole camera model is introduced, and with it the var-
ious coordinate systems in terms of which points in the image plane can in different
scenarios be expressed. Section 4, in turn, describes the lens distortion models sup-
ported by RealityScan, correcting for the lens distortion effects that cause real-world
cameras to deviate from the idealized (frontal) pinhole model. Next, in Section 5,
orientation in terms of yaw, pitch, roll or omega, phi, kappa angles—i.e., in terms of
particular kinds of Euler angles—is described. Appendix A details various coordinate
systems in terms of which RealityScan is able to export estimated camera geometry,
using RealityScan’s Reporting System (paRSer). Finally, Appendix B describes the
variables output by RealityScan in the form of RealityScan XMP files.


2    Preliminaries
Notationally, this document adheres to the conventions of Hartley and Zisserman [1],
which have been widely adopted in the computer vision community. Vectors—e.g.,
x = (x, y)⊤ ∈ R2 or X = (X, Y, Z)⊤ ∈ R3 —are thus typeset in bold and under-
stood to be column vectors, and matrices—e.g., K—are typeset using typewriter
font. Relatedly, the manner in which points, rotations, and rigid body transfor-
mations are expressed in this document is described in Sections 2.1, 2.2, and 2.3,



                                          1
respectively. A ‘Cartesian’ coordinate system is understood to be a coordinate sys-
tem whose axes are pairwise-orthogonal. In this document, all all 3-dimensional
Cartesian coordinate frames are right-handed coordinate systems.1

2.1     Points
A point in Rn is expressed as an n-dimensional vector (x1 , . . . , xn )⊤ , the familiar
‘Euclidean’ or ‘inhomogeneous’ coordinates of the point. The same point can be
expressed in ‘projective’ or ‘homogeneous’ coordinates as any (n + 1)-dimensional
vector (kx1 , . . . , kxn , k)⊤ ∈ Pn = Rn+1 \ {0}, k ̸= 0. The notation x̃ ∼ x̃′ (with
∼ read ‘is proportional to’) is used to indicate that there exists a k ̸= 0 such that
x̃ = kx̃′ , which is to say that x̃ and x̃′ represent the same point in Pn . Given a
point expressed in homogeneous coordinates (kx1 , . . . , kxn , k)⊤ ∈ Pn , k ̸= 0, its
analogue in Euclidean coordinates is x = (x1 /k, . . . , xn /k)⊤ ∈ Rn . In what follows
of this text, x = (x, y)⊤ and x̃ = (x, y, 1)⊤ are used to refer to points in R2 and
P2 , respectively, rather the subscript notation employed above. Likewise, to refer
to points in R3 and P3 , X = (X, Y, Z)⊤ and X̃ = (X, Y, Z, 1)⊤ , respectively, are
used.

2.2     Rotations
One widespread convention in computer vision is for an n-dimensional rotation
about the origin of the underlying coordinate system to be expressed in terms of
an invertible n × n matrix R such that det(R) = 1, and such that the inverse
rotation R−1 is given by R⊤ and thus R⊤ R = RR⊤ = I. Let α, β, γ be angles
in radians, and let R in what follows of this section be a 3 × 3 matrix, implying
rotation in 3D. Such a matrix R can be decomposed in terms of three ‘elementary
rotations’ RX (α), RY (β), RZ (γ), each a 3 × 3 rotation matrix and each giving a 3-
dimensional rotation about one of the three axes—the X-axis, Y -axis, and Z-axis,
respectively—of the underlying coordinate system. The angles α, β, γ are in the
context of elementary rotations referred to as ‘Euler angles’. Both the 3 × 3 matrix
form R and various Euler angle forms are employed by RealityScan in reasoning
about 3-dimensional rotations.

Elementary rotations in 3D. Let RX (α) be the 3×3 rotation matrix that encodes
the 3-dimensional rotation about the X-axis by the angle α:
                                                    
                                    1   0        0
                         RX (α) = 0 cos α − sin α ,                      (1)
                                    0 sin α cos α
   1 In this document, the terms ‘coordinate frame’ and ‘coordinate system’ are—as is common-

place in computer vision—used interchangeably.




                                             2
RY (β) the 3 × 3 rotation matrix that encodes the 3-dimensional rotation about the
Y -axis by the angle β:
                                                     
                                      cos β 0 sin β
                          RY (β) =  0        1    0 ,                        (2)
                                     − sin β 0 cos β

and RZ (γ) the 3 × 3 rotation matrix that encodes the 3-dimensional rotation about
the Z-axis by the angle γ:
                                                     
                                     cos γ − sin γ 0
                          RZ (γ) =  sin γ   cos γ 0 .                        (3)
                                       0       0     1

Such elementary rotation matrices can be applied in different orderings to yield
a combined rotation matrix. Note that the values of α, β, γ corresponding to a
decomposition of R thus depend on the choice of ordering. For example, first
carrying out rotation about the X-axis, then about the Y -axis, and finally about
the Z-axis gives:

   RXY Z (α, β, γ)
           = RX (α)RY (β)RZ (γ)
                                                                                            
               1     0          0           cos β 0 sin β             cos γ        − sin γ      0
           = 0 cos α − sin α  0                   1      0   sin γ             cos γ       0
               0 sin α cos α               − sin β 0 cos β               0            0         1
                                                                                               
                       cos β cos γ                   − cos β sin γ                     sin β
           = cos α sin γ + sin α sin β cos γ cos α cos γ − sin α sin β sin γ       − sin α cos β .   (4)
               sin α sin γ − cos α sin β cos γ   sin α cos γ + cos α sin β sin γ   cos α cos β

Alternatively, first carrying out rotation about the X-axis, then about the Y -axis,
and finally about the Z-axis gives:

      RZY X (α, β, γ)
            = RZ (γ)RY (β)RX (α)
                                                                                        
                cos γ − sin γ 0             cos β 0 sin β            1       0          0
            =  sin γ     cos γ 0  0                 1    0  0 cos α − sin α
                  0         0       1 − sin β 0 cos β                0 sin α cos α
                                                                                          
               cos γ cos β cos γ sin β sin α − sin γ cos α cos γ sin β cos α + sin γ sin α
            = sin γ cos β sin γ sin β sin α + cos γ cos α sin γ sin β cos α − cos γ sin α . (5)
                  − sin β                cos β sin α                       cos β cos α

It is in terms of Euler angles that yaw, pitch, roll and omega, phi, kappa angles
output by RealityScan are expressed (cf. Section 5).

2.3     Rigid Body Transformations
A ‘rigid body transformation’—also referred to as a Euclidean transformation—is
a transformation that carries out both rotation and translation. Let (R, t) be the

                                                   3
notation used to denote an n-dimensional rigid body transformation. Given a point
X ∈ Rn , such a transformation first applies to X the n × n rotation matrix R and
then the translation t ∈ Rn , yielding RX + t. It is the norm in computer vision that
a camera’s ‘pose’ is expressed in terms of a 3-dimensional rigid body transformation,
as detailed in Section 3.

Rigid body transformations in 3D. A 3-dimensional rigid body transforma-
tion (R, t) is expressed as a linear transformation over P3 in the form of a 4 × 4
matrix TE as                                     
                                           R t
                                  TE =              ,                          (6)
                                          0⊤ 1
where R denotes a 3 × 3 rotation matrix and t ∈ R3 a 3-dimensional transla-
tion vector. Let X ∈ R3 be a 3-dimensional point. Applying (6) to the point’s
analogue X̃ = (X⊤ , 1)⊤ ∈ P3 in homogeneous coordinates transforms the point
according to                              
                          RX + t       R t X
                                  = ⊤              ,                      (7)
                            1         0    1   1
which has the effect of first rotating X about the origin of the underlying coordinate
frame by R and then translating the resulting rotated point RX by t, yielding the
transformed point RX + t ∈ R3 .

Inversion. Given a rigid body transformation (R, t), the inverse rigid body trans-
formation is given in matrix form by
                           −1
                                         R−1   −R−1 t               R⊤   −R⊤ t
                                                                             
                   R   t
                                 =                          =                        .   (8)
                  0⊤   1                 0⊤      1                  0⊤    1

Accordingly, if g = (R, t) denotes a rigid body transformation, the transforma-
tion g −1 = (R⊤ , −R⊤ t) denotes the inverse rigid body transformation.


3    Frontal Pinhole Camera
As in the norm in computer vision, RealityScan models cameras in terms of a for-
malism called the ‘frontal pinhole camera’. Consider a classical camera obscura,
consisting of only a dark chamber with a small aperture—i.e., an opening—at one
end and an image plane at the other (cf. Figure 1). As the aperture is made ever
smaller, in the limit only those rays of light reflecting or emanating from points
outside the chamber that pass directly through the aperture are allowed to reach
the image plane. The resulting idealized construction is called a ‘pinhole cam-
era’, modelled mathematically with C = 0 as the center of projection or ‘camera
center’—the position of the infinitesimal aperture—and Z = −f the image plane,
where f is termed the focal length (cf. Figure 2). Like a genuine camera obscura,
the image of a scene obtained according to a pinhole camera is flipped along the
x- and y-axes of the image plane. The effect of undoing this image flip is achieved


                                                4
Figure 1: Engraving of a camera obscura from Athanasius Kircher’s Ars Magna
Lucis et Umbræ (1645).


by placing the image plane instead at Z = f , giving rise to what is called the
‘frontal pinhole camera’ (cf. Figure 3). The intersection of the Z-axis with the
image plane is called the principal point. Given a frontal pinhole camera and a
point Xcam = (Xcam , Ycam , Zcam )⊤ expressed in the coordinate frame of the cam-
era, the projection xcam ∈ R2 of Xcam is obtained by intersecting the image plane
with the line through C and Xcam . This form of projection is referred to as ‘central
projection’.
    What follows of this section is further treatment of aspects of the frontal pinhole
camera relevant to RealityScan. First, the 3-dimensional coordinate frames in terms
of which cameras and points in the scene can be embedded are examined: the
camera coordinate frame (the native coordinate frame of a frontal pinhole camera
expressed in what is called canonical pose), and the world coordinate frame (the
coordinate frame in terms of which cameras in so-called non-canonical pose are
expressed). Next, the various 2-dimensional coordinate frames in terms of which
points in the image plane can be expressed are treated: camera coordinates, image
coordinates, pixel coordinates (the form used by OpenCV or in cameras exported
by COLMAP), normalized image coordinates (the representation used internally
by RealityScan, and used for principal point in RealityScan XMPs), and 35 mm
equivalent (used potentially for focal length in Exif metadata,2 or for focal length
in RealityScan XMPs). In treating each of these image plane coordinate frames,
projection of a scene point expressed in terms of the world coordinate frame to the
image plane coordinate frame in question is outlined. The section concludes with a
brief discussion of back-projection, a notion referred to in Section 4 in describing how
the frontal pinhole camera model is extended to additionally model lens distortion
effects present in imagery produced by real-world cameras.
  2 The Exif tag in question is Exif.Photo.FocalLengthIn35mmFilm.




                                           5
                         x

                                              0
                   x
                                                                 Z
                         y           X

                                 f

                                                                       Xcam
                                               Y

Figure 2: The pinhole camera, modeling an idealized camera obscura with infinitesi-
mal aperture. Let C = 0 ∈ R3 be the aperture—termed also the center of projection
or the ‘camera center’—and let Z = −f be the image plane, with f termed the ‘fo-
cal length’. The point Xcam ∈ R3 projects to x ∈ R2 in the image plane, obtained
by intersecting the image plane with the line through Xcam and C = 0. Note that
with the image plane at Z = −f , images appear flipped about the image plane’s
x- and y-axes.


Camera coordinate frame (canonical pose). A frontal pinhole camera is said to
be in ‘canonical pose’ when it has its camera center C situated at the origin 0, the
image plane situated at Z = f , and the x- and y-axes of the image plane aligned
with the X- and Y -axes of the coordinate frame. When the camera is expressed
accordingly, points expressed in terms of the underlying coordinate frame are said to
be in the ‘camera coordinate frame’ of the camera in question. The frontal pinhole
camera shown in Figure 3 is thus in canonical pose, with the point Xcam expressed
in the camera coordinate frame of that camera.

World coordinate frame (non-canonical pose). The alignment stage of pho-
togrammetric software like RealityScan yields not a single camera in its camera
coordinate frame, but a multitude of cameras embedded in what is called a ‘world
coordinate frame’. In general, the individual estimated cameras are thus expressed
in what is called ‘non-canonical pose’. Let X be a point expressed in terms of the
world coordinate frame. Given a camera in non-canonical pose, let the 3D rigid
body transformation (R, t) be the transformation—called the camera’s ‘pose’—that
transforms a point X to the corresponding point Xcam in the camera’s coordinate
frame:
                                                             
                    Xcam        RX + t         R t X            R t
        X̃cam =            =              = ⊤              = ⊤          X̃.    (9)
                      1            1          0    1    1      0    1



                                         6
                       Zcam                                                Zcam
                   f                                                   f
       0                xcam                  ZZ           0                                      ZZ
                                                                                   ycam
                                       Xcam                                                      Ycam
 X                                                     X
                                                       X
 X                      xcam                                                xcam

                                  Xcam                                                    Xcam
      Y                                                    Y
      Y                                                    Y

           (a) xcam = f Xcam /Zcam .                           (b) ycam = f Ycam /Zcam .

Figure 3: The frontal pinhole camera. Placing the image plane at Z = f instead of
at Z = −f has the effect of undoing the flipping of the image that is characteristic
of the pinhole camera (cf. Figure 2). The projection xcam = (xcam , ycam )⊤ =
(f Xcam /Zcam , f Ycam /Zcam )⊤ from (12) of a point Xcam = (Xcam , Ycam , Zcam )⊤
to the camera’s image plane via central projection is obtained by similar triangles. A
camera expressed accordingly—with camera center at 0 and its X-, Y -, and Z-axes
thus aligned with those of the underlying world coordinate system—is said to be
in ‘canonical pose’, with the point Xcam expressed in what is referred to as the
‘camera coordinate frame’ of the camera.


This transformation is illustrated in Figure 4, along with projection in terms of
camera coordinates (cf. below). Note in the figure that the corresponding camera
center C—i.e., the camera’s center of projection—for a camera in non-canonical
pose is given by
                                    C = −R⊤ t.                               (10)
Note that RC + t = −RR⊤ t + t = 0, as expected.

Camera coordinates (image plane). The projection xcam ∈ R2 —in what are
called ‘camera coordinates’—via central projection of a point Xcam expressed in
terms of the camera coordinate frame of the camera in question can be computed
by similar triangles according to
                                                      
                                 xcam     f Xcam /Zcam
                       xcam =          =                   .               (11)
                                 ycam      f Ycam /Zcam

expressed in the same units as those in terms of which Xcam is expressed (e.g.,
millimeters). The division by Zcam in (11) is called ‘perspective division’. Expressed




                                                   7
             RX + t
                                X
                                                    x

                                                                    −R−1 t
                    x
                          Z                       RX
                                                                             1
                      0        X

                                                                             R
                          t
                                                           x

                                      2

                                                               −t

Figure 4: Projection (x⊤ , 1)⊤ ∼ K(RX + t) = K[R | t](X⊤ , 1)⊤ ∈ P2 —with K any
one of Kcam , Kim , Kpx , Knorm , or K35mm —of a point X ∈ R3 expressed in terms of
the world coordinate frame to a camera in non-canonical pose. The black camera
at the top-right of the figure is in non-canonical pose, with pose (R, t); the leftmost
gray camera in the figure is in canonical pose, with its camera center situated at the
origin 0 of the underlying world coordinate frame, and its X-, Y - and Z-axes aligned
with the X-, Y - and Z-axes of the world coordinate frame (the Y -axis in the figure
points away from the reader’s viewpoint). Projecting X by K[R | t] amounts to
first expressing X in the camera coordinate frame of the black camera by applying
the rigid body transformation (R, t) to X and then projecting the resulting point
Xcam = RX + t using K. Note that by order of operations, applying the rigid
body transformation (R, t) to X first (i) rotates X about the origin by the rotation
matrix R (indicated in the figure with the number 1), and then (ii) translates the
resulting rotated point RX by the translation vector t (indicated with the number
2). The point C = −R⊤ t = −R−1 t from (10) is the camera center of the black
camera; note that RC + t = 0, as expected.




                                          8
in matrix form, (11) is given by
                                                                         
                                                               Xcam
                        f Xcam /Zcam           f 0 0 0 
              xcam                                                  Ycam 
   x̃cam =           =  f Ycam /Zcam  ∼  0 f 0 0             Zcam  .
                                                                          
               1
                                 1               0 0 1 0
                                                                      1
                                                                            (12)
The 3 × 4 matrix in (12) is called a ‘camera projection matrix’. This matrix can
be further decomposed as
                                                  
        f 0 0 0            f 0 0          1 0 0 0
       0 f 0 0  =  0 f 0   0 1 0 0  = Kcam [I | 0],                   (13)
        0 0 1 0            0 0 1          0 0 1 0
where the 3 × 3 matrix is called a ‘camera calibration matrix’ Kcam :
                                               
                                       f 0 0
                             Kcam =  0 f 0 .                                 (14)
                                        0 0 1
Projection by (13) assumes that the points being projected are expressed in terms
of the camera coordinate frame of the camera at hand. Combining (9) and (13)
gives the projection xcam ∈ R2 of the point X̃ = (X⊤ , 1)⊤ ∈ R3 as
                                                                          
             xcam                                                        R t
  x̃cam =           ∼ Kcam [I | 0]X̃cam = Kcam [R | t]X̃ = Kcam [I | 0] ⊤      X̃.
              1                                                         0  1
                                                                                (15)
The 3 × 4 camera projection matrix Pcam of a camera in non-canonical pose then
takes the form                                                
                                                         R t
                     Pcam = Kcam [R | t] = Kcam [I | 0] ⊤        .              (16)
                                                        0    1
Projection by Pcam for a camera in non-canonical pose is illustrated in Figure 4.

Image coordinates (image plane). The projection xcam from (11) of a point X
is expressed in terms of the the principal point—the point at which the Z-axis
intersects the image plane—acting as the origin of the image plane’s coordinate
frame. Expressing the projection instead with respect to this origin at the top-
left corner of the image plane—as is the convention in most software dealing with
digital imagery—gives the projection xim in image coordinates. This is achieved by
generalizing the camera calibration matrix Kcam from (14) to
                                                
                                       f 0 x0
                               Kim =  0 f y0  ,                             (17)
                                       0 0 1

where (−x0 , −y0 )⊤ are the coordinates of the upper-left corner of the image plane
when the origin is at the principal point, and hence
                                   pim = (x0 , y0 )⊤                           (18)

                                          9
are the coordinates of the principal point when the origin is at the upper-left corner.
The corresponding camera matrix Pim then takes the form
                                                             
                                                        R t
                       Pim = Kim [R | t] = Kim [I | 0] ⊤        .                 (19)
                                                       0    1
Accordingly,                                     
                              f Xcam /Zcam + x0
                  xim =                               = xcam + pim .              (20)
                              f Ycam /Zcam + y0
The corresponding 3 × 4 camera projection matrix Pim of a camera in non-canonical
pose takes the form
                                                         
                                                      R t
                     Pim = Kim [R | t] = Kim [I | 0] ⊤      .               (21)
                                                     0  1
Note that as with xcam from (11), xim is expressed in the same units as the pro-
jecting point X.

Pixel coordinates (image plane). The units of a projection xim from (19)—as
with those of xcam from (11)—are both the same as those of the projecting point X.
Suppose, without loss of generality, that these units are millimeters. Expressing the
projection instead in units of pixels gives the projection xpx in what are called pixel
coordinates. Let mx = w [px] /w [mm] and my = h [px] /h [mm], where in turn h [mm]
and w [mm] are the CCD height and width in millimeters and h [px] and w [px] the
height and width of the image in pixels, respectively. Obtaining the projection in
units of pixels is achieved by modifying the camera calibration matrix Kim from (17)
to                                                                
                         fpx 0 x0,px             mx f     0    mx x0
                Kpx =  0 fpx y0,px  =  0             mx f mx y0  .            (22)
                          0    0       1          0       0       1
In practice, it is assumed that my = mx , which holds when pixels are genuinely
square. Assuming here that this is the case, the focal length fpx in units of pixels
is given by
                                fpx = mx f = my f.                             (23)
The principal point ppx —likewise in units of pixels—is given by
                                                   
                                    x0,px       mx x0
                           ppx =           =            .                         (24)
                                    y0,px       mx y0

Let xim = (xim , yim )⊤ . Accordingly,
                                                           
                           mx xim      fpx Xcam /Zcam + x0,px
                xpx =              =                            .                 (25)
                           mx yim      fpx Ycam /Zcam + y0,px
The corresponding 3 × 4 camera projection matrix Ppx of a camera in non-canonical
pose takes the form
                                                         
                                                      R t
                     Ppx = Kpx [R | t] = Kpx [I | 0] ⊤      .               (26)
                                                     0  1

                                          10
Normalized image coordinates (image plane). The focal length and principal
point estimated by RealityScan’s SfM pipeline (i.e., RealityScan’s Alignment stage)
are expressed natively not in terms of pixels as in fpx and ppx from (23) and (24),
respectively, but instead in terms of what are called ‘normalized’ image coordinates.
Let w and h be the width and height of the image in question, respectively. In a
final step of the feature detector, the pixel location xpx associated with the feature
is expressed in normalized image coordinates as

                               xnorm = (xpx − v)/s,                              (27)

where the scaling factor s is given by

                                   s = max(w, h)                                 (28)

and the offset v by                             
                                             w/2
                                    v=             .                             (29)
                                             h/2
The pixel locations of features output by RealityScan’s feature detector—part of
RealityScan’s SfM pipeline—are thus centered on (0, 0)⊤ and range from −0.5 to
0.5 in x and y, respectively. The focal length fnorm expressed in normalized image
coordinates is given accordingly by

                                   fnorm = fpx /s,                               (30)

and the principal point pnorm in normalized image coordinates by
                                         
                                  x0,norm
                        pnorm =             = (ppx − v)/s.                       (31)
                                  y0,norm

The camera calibration matrix Knorm expressed in normalized image coordinates is
thus given by                                          
                                fnorm     0     x0,norm
                      Knorm =  0       fnorm y0,norm  .                  (32)
                                  0       0        1
The corresponding 3 × 4 camera projection matrix Pnorm of a camera in non-
canonical pose takes the form
                                                            
                                                         R t
                  Pnorm = Knorm [R | t] = Knorm [I | 0] ⊤      .      (33)
                                                        0  1

It is in normalized image coordinates that principal point is expressed in XMP files
(cf. Appendix B).

35 mm equivalent (image plane). The focal length f35mm expressed in 35 mm
equivalent is obtained from fnorm from (30) by

                                f35mm = 36 · fnorm                               (34)


                                         11
                24 mm                                       35 mm




                                    36 mm

Figure 5: 35 mm film. It is the width of 35 mm film that measures 35 mm.
The width and height of the photosensitive surface of 35 mm film measures 36
mm and 24 mm, respectively. Recall that the normalization in normalized image
coordinates is with respect to max(w, h), where w and h are the width and height
of the image in question. It is for this reason that the focal length f35mm and
principal point p35mm in 35 mm equivalent from (34) and (35) are obtained by
multiplying fnorm and pnorm in normalized image coordinates from (30) and (31)
by 36, respectively.


and the principal point p35mm = (x0,35mm , y0,35mm )⊤ in 35 mm equivalent from
pnorm = (x0,norm , y0,norm )⊤ from from (31) according to
                                                         
                                  x0,35mm      36 · x0,norm
                      p35mm =              =                  .            (35)
                                  y0,35mm      36 · y0,norm

The camera calibration matrix K35mm expressed in 35 mm equivalent is thus given
by                                                     
                               f35mm      0     x0,35mm
                     K35mm =  0       f35mm y0,35mm  .                   (36)
                                  0       0         1
The reason for multiplying by 36 in (34) and (35) derives from the 36 mm width of
the photosensitive surface of 35 mm film3 (cf. Figure 5). The corresponding 3 × 4
camera projection matrix P35mm of a camera in non-canonical pose takes the form
                                                              
                                                         R t
                  P35mm = Knorm [R | t] = K35mm [I | 0] ⊤        .           (37)
                                                        0     1

It is in 35 mm equivalent that RealityScan displays the focal length and principal
point in the UI (cf. Figure 6), and likewise in 35 mm equivalent that focal length is
expressed in XMP files (cf. Appendix B).

Back-projection (ray). The vector in R3 with Z = 1 from the origin 0 in the di-
rection of the location of the pixel xpx = (xpx , ypx )⊤ in the image plane—expressed
  3 https://en.wikipedia.org/wiki/135_film




                                         12
Figure 6: Focal length f35mm from (34) and principal point p35mm =
(x0,35mm , y0,35mm )⊤ from (35)—provided separately as x0,35mm and y0,35mm —
displayed in RealityScan’s UI. Accordingly, focal length and principal point are here
in RealityScan’s UI both provided in 35 mm equivalent.


in the camera coordinate frame—is called the ‘back-projection’ of xpx , and is given
by
                                                xpx −x0,px 
          xpx      1/fpx      0    −x0,px /fpx     xpx
                                                             fpx0,px 
    K−1
     px
         ypx  =  0       1/fpx −y0,px /fpx   ypx  =  ypx −yfpx     , (38)
           1          0       0         1           1              1

where, as indicated above, fpx is the focal length and ppx = (x0,px , y0,px )⊤ the
principal point, each expressed in units of pixels. Interpreted as a vector in P2 , the
back-projection of xpx is the ray emanating from the camera center along which
the point Xcam that projects to xpx is required to lie.4 Moreover,
                         xpx −x0,px                         
                        xpx            fpx            Xcam /Zcam
                  K−1
                   px
                       ypx  =  ypx −y0,px  =  Ycam /Zcam  ,
                                            
                                                                                   (39)
                                       fpx
                         1              1             Zcam /Zcam

since by (25)
                               xpx = fpx Xcam /Zcam + x0,px                       (40)
and
                               ypx = fpx Ycam /Zcam + y0,px .                     (41)
Note that (38) and (39) hold not only for points in the image plane expressed
in pixel coordinates, but—having appropriately replaced both Kpx and xpx —for
camera coordinates, image coordinates, normalized image coordinates, and 35 mm
equivalent as well.
  4 Assuming the absence of lens distortion effects; cf. Section 4.




                                               13
                    Brown Lens Distortion Model                                                      Brown Lens Distortion Model
           (k1 = −0.35, k2 = 0, k3 = 0, k4 = 0, t1 = 0, t2 = 0)                             (k1 = 0.35, k2 = 0, k3 = 0, k4 = 0, t1 = 0, t2 = 0)



400                                                                              400




300                                                                              300




200                                                                              200




100                                                                              100




  0                                                                                0
      0    100       200         300        400         500       600                  0   100       200         300         400         500       600



                 (a) Barrel distortion.                                                    (b) Pincushion distortion.

Figure 7: Radial lens distortion via the Brown lens distortion model, on the example
of a 640 × 480-pixel image with focal length fnorm = 1 and principal point—and
thus center of distortion—at the image center. Each arrow indicates displacement
from an undistorted pixel xu to its distorted counterpart xd . (a) Barrel distortion,
exemplified with k1 = −0.35. (b) Pincushion distortion, exemplified with k1 = 0.35.
For both subfigures (a) and (b), all coefficients besides k1 are set to zero.


4         Lens Distortion
Brown’s model—in various numbers of coefficients—and the single-coefficient divi-
sion model are the lens distortion models supported by RealityScan. Let Xcam =
(Xcam , Ycam , Zcam )⊤ be a point in the camera’s coordinate frame and xnorm be its
projection by Knorm ,                
                                xnorm
                                         ∼ Knorm Xcam .                       (42)
                                   1
Note that projection in this manner assumes that the underlying camera is an
idealized frontal pinhole camera, free of the lens distortion effects characteristic of
imagery acquired by real-world cameras (cf. Section 3). Given the lens distortion
model coefficients estimated for the image at hand, the location xd,norm —where the
subscript d indicates ‘distorted’—in normalized image coordinates of the projection
of Xcam subject to those modelled lens distortion effects is obtained by
                                                      
                                    xd,norm              xd
                       x̃d,norm ∼             ∼ Knorm         ,                   (43)
                                       1                  1

where                                                                  
                                                                  xd
                                                  xd =                      = distort(xu ).                                                       (44)
                                                                  yd
The point xu = (xu , yu ) from (44)—where the subscript u indicates ‘undistorted’,
in the sense of ‘free of distortion’—is obtained by computing the back-projection of



                                                                            14
                     Brown Lens Distortion Model                                             Brown Lens Distortion Model                                               Brown Lens Distortion Model
          (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0.1, t2 = −0.1)                    (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0, t2 = −0.1)                     (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = −0.1, t2 = −0.1)



400                                                                     400                                                                      400




300                                                                     300                                                                      300




200                                                                     200                                                                      200




100                                                                     100                                                                      100




  0                                                                       0                                                                        0
      0   100        200         300        400         500       600         0   100           200         300        400         500     600         0   100        200         300        400         500        600

                     Brown Lens Distortion Model                                               Brown Lens Distortion Model                                            Brown Lens Distortion Model
            (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0.1, t2 = 0)                          (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0, t2 = 0)                    (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = −0.1, t2 = 0)



400                                                                     400                                                                      400




300                                                                     300                                                                      300




200                                                                     200                                                                      200




100                                                                     100                                                                      100




  0                                                                       0                                                                        0
      0   100        200         300        400         500       600         0   100           200         300        400         500     600         0   100        200         300        400         500        600

                     Brown Lens Distortion Model                                             Brown Lens Distortion Model                                               Brown Lens Distortion Model
           (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0.1, t2 = 0.1)                     (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = 0, t2 = 0.1)                      (k1 = 0, k2 = 0, k3 = 0, k4 = 0, t1 = −0.1, t2 = 0.1)



400                                                                     400                                                                      400




300                                                                     300                                                                      300




200                                                                     200                                                                      200




100                                                                     100                                                                      100




  0                                                                       0                                                                        0
      0   100        200         300         400        500       600         0   100           200         300         400        500     600         0   100         200        300         400        500        600




Figure 8: Tangential lens distortion via the Brown lens distortion model, on the
example of a 640 × 480-pixel image with focal length fnorm = 1 and principal
point—and thus center of distortion—at the image center. Each arrow indicates
displacement from an undistorted pixel xu to its distorted counterpart xd . In each
case shown, all radial lens distortion coefficients are set to zero.




                                                                                                          15
xnorm from (42) according to (38) or (39), giving
                                                             
                      xu                        Xcam /Zcam
              xu                        x norm
                   =  yu  = K−1norm            =  Ycam /Zcam  ,                            (45)
               1                           1
                        1                            Zcam /Zcam

and the function distort() from (44) can be either the Brown model or the division
model, further described below. For what follows, let r be
                                      p
                                  r = x2u + yu2 ,                            (46)

which gives the distance in the image plane of (xu , yu )⊤ from the center of distor-
tion (0, 0)⊤ , with both expressed in camera coordinates. Accordingly, the units in
which this distance is expressed is the same as the units of Xcam .

Brown model. RealityScan supports the Brown model—known also as the Brown-
Conrady model—in various configurations5 of up to three radial distortion coeffi-
cients k1 , k2 , k3 and two tangential distortion coefficients t1 , t2 (cf. Figure 7 and
Table 1). For configurations that do not have all five of these coefficients, the omit-
ted coefficients are kept set to zero. Given xu = (xu , yu )⊤ from (45), the distorted
counterpart xd = (xd , yd )⊤ from (44) according to the Brown model with three
radial and two tangential distortion coefficients is obtained by

                        xd = xu + xu (k1 r2 + k2 r4 + k3 r6 + k4 r8 )
                                   + t2 (2xu yu ) + t1 (r2 + 2x2u )                            (47)

and

                        yd = yu + yu (k1 r2 + k2 r4 + k3 r6 + k4 r8 )
                                   + t2 (2xu yu ) + t1 (r2 + 2yu2 ).                           (48)

Accordingly, RealityScan adheres to the OpenCV ordering of radial coefficients (Re-
alityScan’s radial coefficients k1 , k2 , k3 , k4 are OpenCV’s k1 , k2 , k3 , k4 ), but deviates
from the OpenCV ordering of tangential coefficients by swapping the two (Reali-
tyScan’s tangential coefficients t1 , t2 are OpenCV’s t2 , t1 ).6
   5 With (i) the first three radial coefficients k , k , k , with (ii) all four radial coeffi-
                                                            1 2 3
cients k1 , k2 , k3 , k4 , with (iii) the first three radial coefficients and both tangential coeffi-
cients t1 , t2 , or with (iv) all four radial coefficients and both tangential coefficients.
   6 Cf. the OpenCV Brown lens distortion model source code at https://github.com/

opencv/opencv/blob/5199850039ad23f1f0e6cccea5061a9fea5efca6/modules/calib3d/
src/calibration.cpp#L799-L800—where the first five coefficients in the array k, using
RealityScan naming, are (k1 , k2 , t2 , t1 , k3 , k4 )—and the Fraunhofer-IIS CAMORPH cam-
era format conversion toolbox [2] source code at https://github.com/Fraunhofer-IIS/
camorph/blob/2c95c8b15b0532d6280091761a9b51ab65cd2f98/camorph/ext/RealityCapture/
RealityCapture.py#L77-L86, which takes the flip into account.




                                                 16
                   Division Lens Distortion Model                                                   Division Lens Distortion Model
                             (k1 = 0.35)                                                                     (k1 = −0.35)



400                                                                          400




300                                                                          300




200                                                                          200




100                                                                          100




  0                                                                            0
      0   100       200       300         400        500      600                  0         100     200       300       400         500   600



                (a) Barrel distortion.                                                       (b) Pincushion distortion.
                                                            Division Lens Distortion Model
                                                                       (k1 = 0)



                                    400




                                    300




                                    200




                                    100




                                      0
                                          0         100      200       300         400        500     600



                                                           (c) No distortion.

Figure 9: Division lens distortion model model, on the example of a 640 × 480-
pixel image with focal length fnorm = 1 and principal point—and thus center of
distortion—at the image center. Each arrow indicates displacement from an undis-
torted pixel xu to its distorted counterpart xd . (a) Barrel distortion, exemplified
with k1 = 0.35. (b) Pincushion distortion, exemplified with k1 = −0.35. (c)
k1 = 0, i.e., no distortion.




                                                                      17
Division model. RealityScan supports the division model of a single coefficient k1
(cf. Figure 9). Given xu = (xu , yu )⊤ from (45), the distorted counterpart xd =
(xd , yd )⊤ from (44) according to the division model is obtained by
                                                    xu
                                         xd =                                                   (49)
                                                 1 + k1 r 2
and
                                                   yu
                                         yd =             .                                     (50)
                                                1 + k1 r2

5      Orientation and Euler Angles
Let (R, t) be a camera’s pose, with the 3 × 3 world-to-camera rotation matrix R
termed the camera’s orientation (cf. Section 3). In classical photogrammetry,7 a
widely used alternative convention is for the camera’s ‘attitude’—what, given the
pose (R, t), is in matrix form expressed by the world-to-camera rotation matrix R⊤ —
to be given in terms of any of a variety of forms of 3-dimensional camera-to-world
rotations. These rotations are expressed not in terms of 3 × 3 rotation matrices,
but rather in terms of Euler angles (cf. Section 2.2). This section describes the
variants in representing camera attitude in terms of Euler angles that are supported
by RealityScan. For further background, the reader is referred to Bäumker and
Heimes [3].

Camera coordinate system. When reasoning about a camera’s attitude in terms
of Euler angles, the norm is to use photogrammetric camera axis conventions. In
computer vision, the camera coordinate system’s X- and Y -axes respectively point
rightwards and downwards in the image plane, with the Z-axis pointing into the
scene (cf. Figures 3 and 10a); in classical photogrammetry, however, the camera
coordinate system’s X- and Y -axes respectively point rightwards and upwards in the
image plane, with the Z-axis pointing away from the scene (cf. Figure 10b). Note
that both conventions have the X-axis point rightwards in the image plane. For
yaw, pitch, roll, RealityScan supports only the photogrammetric camera coordinate
system, as is the norm (cf. Section 5.1); for omega, phi, kappa, RealityScan supports
both, for reasons to be discussed (cf. Section 5.2).

5.1     Yaw, Pitch, Roll (ZYX+NED)
Let XNED , YNED , and ZNED be the axes of a right-handed Cartesian coordinate
system with NED standing for ‘north, east, down’, further detailed according to
   7 Classical photogrammetry predates computer vision—and, indeed, the very advent of

computers—and has its own terminology and conventions. Notably, in what concerns termi-
nology, what are called ‘intrinsics’ (including distortion model coefficients) and ‘extrinsics’ (or
‘pose’) in computer vision are referred to as ‘inner orientation’ and ‘outer orientation’ in classical
photogrammetry, respectively. In computer vision, ‘orientation’ is a 3-dimensional world-to-camera
rotation, expressed as R; the analogue in classical photogrammetry is ‘attitude’, a 3-dimensional
camera-to-world rotation given in matrix form by R⊤ . This document adheres to computer vision
terminology and conventions unless explicitly mentioned otherwise.


                                                 18
                                                                           Z
                                                                               Y

                             X                                                     X
                     Y
                         Z




           (a) Computer vision.                               (b) Photogrammetric.

Figure 10: Camera coordinate systems. (a) In computer vision, the camera coordi-
nate system’s X- and Y -axes respectively point rightwards and downwards in the
image plane, with the Z-axis pointing into the scene (as is the case in Figure 3).
(b) In classical photogrammetry, the camera coordinate system’s X- and Y -axes
respectively point rightwards and upwards in the image plane, with the Z-axis point-
ing away from the scene.


the three cases below: local in Section 5.1.1, and global geospatial8 or global non-
geospatial in Section 5.1.2. Moreover, let Xbody , Ybody , and Zbody be the axes of a
right-handed Cartesian coordinate system called the ‘body coordinate system’; these
are the axes of the aircraft upon which the camera is mounted, with Xbody pointing
towards the aircraft’s nose, Ybody towards its right wing, and Zbody in the nadir
direction. What are called ‘yaw’ ψ, ‘pitch’ ϕ, and ‘roll’ θ are Euler angles—applied in
ZYX ordering (5)—expressed in degrees that give the 3-dimensional rotation of the
aircraft’s Xbody -, Ybody -, and Zbody -axes relative to the XNED , YNED , and ZNED -
axes (cf. Figure 11). It is through the addition of what is called a ‘camera mount’—
the 3-dimensional rotation expressing the X-, Y -, and Z-axes of the camera relative
to the aircraft’s Xbody -, Ybody -, and Zbody -axes—that yaw, pitch, roll express the
attitude of the camera mounted on the aircraft (cf. Figure 12).

Yaw (heading). Rotation angle ψ in degrees about the ZNED -axis, applied in
radians as part of (5) according to (3); cf. Figure 11b.

Pitch (elevation). Rotation angle ϕ in degrees about the YNED -axis, applied in
radians as part of (5) according to (2); cf. Figure 11c.
    8 A ‘geospatial’ component is one that has been georeferenced with respect to position priors—

i.e., camera position priors or GCPs—provided in a geospatial coordinate system. Accordingly, a
component georeferenced with respect to local:1 - Euclidean is not geospatial.




                                               19
                                        XNED                                                           XNED

                       Z        Xbody                                          Z
                                                                                                 Xbody
                            Y                                                              Y
                                X                                                          X
                                    Ybody
                                                                                                 Ybody
                                               YNED                                                           YNED

                       Zbody                                                   Zbody




                       ZNED                                                    ZNED




      (a) Yaw, pitch, and roll of 0◦ .                     (b) Yaw of 15◦ ; pitch and roll of 0◦ .




                                        XNED                                                           XNED
                                Xbody
                      Z                                                            Z           Xbody
                            Y
                                                                                       Y

                                X
                                    Ybody                                                  X
                                               YNED                                                Ybody      YNED
                           Zbody                                             Zbody




                       ZNED                                                    ZNED




   (c) Pitch of 15◦ ; yaw and roll of 0◦ .                 (d) Roll of 15◦ ; yaw and pitch of 0◦ .

Figure 11: Yaw ψ, pitch ϕ, roll θ rotation angles expressing the aircraft’s Xbody -,
Ybody -, and Zbody -axes relative to the XNED -, YNED -, and ZNED -axes, illustrated
with the example of RealityScan’s default camera mount (cf. Figure 12a). (a) For
yaw, pitch, roll all at 0◦ , Xbody points towards XNED , Ybody points towards YNED ,
and Zbody points towards ZNED . (b) Positive yaw rotates the aircraft clockwise,
with ZNED the axis of rotation. (c) Positive pitch angle points the aircraft’s nose
upwards, with YNED the axis of rotation. (d) Positive roll angle causes the aircraft’s
right wing to point downwards, with XNED the axis of rotation.




                                                      20
                                     Xbody                                          Xbody

                         Z                                              Z
                             Y

                                 X                                              Y
                                                                    X
                                             Ybody                                          Ybody




                         Zbody                                          Zbody




   (a) X-axis to right wing (default).                    (b) X-axis to tail.




                                     Xbody                                          Xbody

                         Z                                              Z
                                                                            X
                 X                                              Y

                     Y
                                             Ybody                                          Ybody




                         Zbody                                          Zbody




        (c) X-axis to left wing.                          (d) X-axis to nose.

Figure 12: Nadir-facing camera mounts supported by RealityScan, with the X-axis
pointing in the direction of Xbody —i.e., to the aircraft’s right wing—the default.
Note that the camera axis convention employed is the photogrammetric one, with
the camera’s X- and Y -axes respectively pointing rightward and upward in the
image plane, and with the Z-axis pointing away from the scene.




                                                     21
Roll (bank). Rotation angle θ in degrees about the XNED -axis, applied in radians
as part of (5) according to (1); cf. Figure 11d.

Camera mount. The orientation of the physical camera’s X-, Y -, and Z-axes
relative to the Xbody -, Ybody -, and Zbody -axes of the aircraft upon which the
camera is mounted. In order to convert yaw, pitch, roll angles in trajectory import
to a corresponding camera orientation, the camera mount relative to the platform
must be indicated by the user. RealityScan supports four nadir-facing mounts in
trajectory import (cf. Figure 12); the default in RealityScan is for the camera’s X-
axis to point in the positive Ybody -direction, i.e., in the direction of the aircraft’s
right wing (cf. Figure 12a). It is with respect to this default mount that RealityScan
exports yaw, pitch, roll via the Reporting System (cf. Appendix A).

5.1.1   Local (per Camera)
Let X be either a GNSS position associated with an image or an estimated camera
center georeferenced with respect to a geospatial coordinate system. In what is
called ‘local’ yaw, pitch, roll, the orientation of the aircraft’s Xbody -, Ybody -, and
Zbody -axes is computed relative to XNED , YNED , and ZNED -axes anchored on
X, such that at X the XNED -axis points north, the YNED -axis points east, and
the ZNED -axis points down. Accordingly, each such anchor point X—i.e., each
camera—has its own corresponding XNED , YNED , and ZNED -axes.

5.1.2   Global (per Component)
Let X be a single anchor point shared by all cameras of the component in question.
In what is called ‘global’ yaw, pitch, roll, it is with respect to this shared anchor
point that the XNED -, YNED -, and ZNED -axes of each camera that belongs to the
component is computed. For geospatial components, these axes are placed—as in
Section 5.1.1—such that at X the XNED -axis points north, the YNED -axis points
east, and the ZNED -axis points down. For components that are not geospatial,
the axes do not have such a ‘north, east, down’ interpretation. A component’s
anchor point is computed by RealityScan roughly as the center of the sparse points
associated with the component.

5.2     Omega, Phi, Kappa (XYZ+ENU)
Let XENU , YENU , and ZENU be the axes of a right-handed Cartesian coordinate
system with ENU standing for ‘east, north, up’, further detailed according to the
three cases below: local in Section 5.2.1, and global geospatial or global non-
geospatial in Section 5.2.2. What are called ‘omega’ ω, ‘phi’ ϕ, and ‘kappa’ κ
are Euler angles—applied in XYZ ordering (4)—expressed in degrees that give the
3-dimensional rotation of the camera’s X-, Y -, and Z-axes relative to the XENU ,
YENU , and ZENU -axes, with the camera’s axes expressed either with respect to the
photogrammetric convention (cf. Figures 14) or with respect to the computer vision
convention (cf. Figure 15).


                                          22
                                                                                ZECEF




                                    h XWGS                                                         XECEF
                                                                                                              YECEF
    Equator                 λ   φ                                  Equator           0




                                                                      XECEF

                    Prime Meridian                                              Prime Meridian



              (a) Geodetic (WGS 84).                              (b) Earth-centered Earth-fixed (ECEF).
                    ZECEF                                                       ZECEF
                                    YENU (north)                                              XNED (north)
                                            ZENU (up)

                                               XENU (east)                                              YNED (east)
                                    0                                                          0
                                                     YECEF                                                    YECEF
    Equator                                                        Equator               ZNED (down)




       XECEF                                                          XECEF

                    Prime Meridian                                              Prime Meridian



         (c) East, North, Up (ENU).                                   (d) North, East, Down (NED).

Figure 13: Coordinate systems used in RealityScan in geospatial components. (a) A
point XWGS = (λ, ϕ, h) in geodetic coordinates is expressed in terms of longitude λ
and latitude ϕ in degrees, and height h above the ellipsoid in meters, with respect to
the WGS 84 ellipsoid centered on the Earth’s center of mass. This is the native co-
ordinate system of the global positioning system (GPS). (b) The same point XECEF
provided in Earth-centered Earth-fixed (ECEF) coordinates is expressed in terms of
the metric right-handed 3D Cartesian coordinate system centered on the WGS 84
ellipsoid, with its XECEF - and YECEF -axes in the equatorial plane and the positive
XECEF -axis passing through the prime meridian. All camera position priors or GCPs
provided in a geospatial coordinate system are converted internally to ECEF. (c) An
East, North, Up (ENU) coordinate system is a metric right-handed 3D Cartesian
coordinate system centered on a given point—termed the ‘anchor’—expressed in
ECEF coordinates, with its XENU -axis pointing eastwards, its YENU -axis pointing
northwards, and its ZENU -axis pointing in the nadir direction. In RealityScan, what
is called the ‘ground plane’ or ‘anchored’ coordinate system is for geospatial com-
ponents an ENU system. Yaw, pitch, roll in RealityScan is expressed in terms of
ENU. (d) A North, East, Down (NED) system. Omega, phi, kappa in RealityScan
is expressed in terms of NED.




                                                             23
                     ZENU                                               ZENU



                     Z           YENU                                               YENU
                                                                       Z        Y
                             Y


                                 X                                                  X
                                        XENU                                               XENU




    (a) Omega, phi, and kappa of 0◦ .               (b) Omega of 15◦ ; phi and kappa of 0◦ .


                     ZENU                                               ZENU



                         Z       YENU                                   Z           YENU

                             Y                                              Y

                                                                                    X
                                 X      XENU                                               XENU




 (c) Phi of 15◦ ; omega and kappa of 0◦ .           (d) Kappa of 15◦ ; omega and phi of 0◦ .

Figure 14: Omega ω, phi ϕ, kappa κ rotation angles expressing the camera’s X-, Y -,
and Z-axes relative to the XENU -, YENU -, and ZENU -axes, with respect to the axes
of a photogrammetric camera coordinate system. Use of this camera coordinate
system in reasoning about camera attitude in terms of omega, phi, kappa is the
norm in classical photogrammetry.




                                               24
                     ZENU                                               ZENU



                     Z           YENU                                               YENU
                                                                       Z        Y
                             Y


                                 X                                                  X
                                        XENU                                               XENU




    (a) Omega, phi, and kappa of 0◦ .               (b) Omega of 15◦ ; phi and kappa of 0◦ .


                     ZENU                                               ZENU



                         Z       YENU                                   Z           YENU

                             Y                                              Y

                                                                                    X
                                 X      XENU                                               XENU




 (c) Phi of 15◦ ; omega and kappa of 0◦ .           (d) Kappa of 15◦ ; omega and phi of 0◦ .

Figure 15: Omega ω, phi ϕ, kappa κ rotation angles expressing the camera’s X-,
Y -, and Z-axes relative to the XENU -, YENU -, and ZENU -axes, with respect to the
axes of a computer vision camera coordinate system. RealityScan introduced the
support in trajectory import for the computer vision camera coordinate system in
reasoning about omega, phi, kappa in order to enable the ingestion of Euler angles
in XYZ ordering associated with images output by the OmniSLAM LiDAR SLAM
system.




                                               25
Omega. Rotation angle ω in degrees about the XENU -axis, applied in radians as
part of (4) according to (1); cf. Figures 14b and 15b.

Phi. Rotation angle ϕ in degrees about the YENU -axis, applied in radians as part
of (4) according to (2); cf. Figures 14c and 15c.

Kappa. Rotation angle κ in degrees about the ZENU -axis, applied in radians as
part of (4) according to (3); cf. Figures 14d and 15d.

5.2.1   Local (per Camera)
Let X be either a GNSS position associated with an image or an estimated camera
center georeferenced with respect to a geospatial coordinate system. In what is
called ‘local’ omaga, phi, kappa, the orientation of the X-, Y -, and Z-axes of the
camera is computed relative to XENU , YENU , and ZENU -axes anchored on X, such
that at X the XENU -axis points east, the YENU -axis points north, and the ZENU -
axis points up. Accordingly, each such anchor point X—i.e., each camera—has its
own corresponding XNED , YNED , and ZNED -axes.

5.2.2   Global (per Component)
Let X be a single anchor point shared by all cameras of the component in question.
In what is called ‘global’ omega, phi, kappa, it is with respect to this shared anchor
point that the XENU -, YENU -, and ZENU -axes of each camera that belongs to the
component is computed. For geospatial components, these axes are placed—as in
Section 5.2.1—such that at X the XENU -axis points east, the YENU -axis points
north, and the ZENU -axis points up. For components that are not geospatial, the
axes do not have such a ‘east, north, up’ interpretation. A component’s anchor point
is computed by RealityScan roughly as the center of the sparse points associated
with the component.


A       Reporting System (paRSer)
The present appendix describes the various variables concerning estimated camera
geometry—i.e., intrinsics and extrinsics—accessible via RealityScan’s Reporting Sys-
tem (paRSer). The variables are exposed, e.g., via RealityScan’s calibration.xml
file,9 which can be extended to produce custom exporters, accessible via the Out-
put:Export button in RealityScan’s WORKFLOW ribbon or the Export:Registration
button in its ALIGNMENT ribbon (cf. Figure 16). The appendix begins with intrin-
sics in Appendix A.1, and continues with extrinsics for geospatial and non-geospatial
components in Sections A.2 and A.3, respectively. Recall that a camera’s extrinsics
refer to the pose (R, t) and give the camera center C = −R⊤ t from (10). Recall
    9 Situated at C:\Program Files\Epic Games\RealityScan <version> (or in C:\Program

Files\Capturing Reality\RealityCapture prior to the rebranding of RealityCapture to Re-
alityScan in 2025).



                                          26
        (a) Via WORKFLOW ribbon.                  (b) Via ALIGNMENT ribbon.

Figure 16: Exporting estimated camera geometry in RealityScan via the UI, both
exposing the same exporters defined in the calibration.xml file. This file can be
modified by the user to include custom exporters. It is the variables of RealityScan’s
reporting system concerning intrinsics and extrinsics accessible via such exporters
that are the subject of Appendix A.


also that this ‘pose’ is in fact the rigid body transformation applied to a given point
X expressed in world coordinates to express that point as Xcam = RX + t in cam-
era coordinates. It is this transformed point Xcam that is projected to the camera’s
image plane—not the point X in world coordinates—using the camera’s intrinsics
(cf. Appendix A.1). Additional information on exporting camera geometry via the
Reporting System is available in the RealityScan Help.10

A.1     Intrinsics
The estimated intrinsics as can be obtained via RealityScan’s reporting system are
focal length and principal point in a handful of coordinate systems (cf. Section 3),
notably—and as described below—in RealityScan’s native normalized image co-
ordinates, in pixel coordinates (used by OpenCV and COLMAP), and in 35 mm
equivalent. Additionally, the reporting system makes available the model coeffi-
cients of the chosen lens distortion model (cf. Section 4), as is likewise described
below.

Normalized image coordinates. It is in normalized image coordinates that Re-
alityScan natively expresses focal length and principal point. This is because in a
final step of feature detection, the pixel location of each feature is converted to nor-
malized image coordinates and left in that form for what remains of RealityScan’s
SfM pipeline. The focal length fnorm in normalized image coordinates from (30) is
obtained from the reporting system by

                                     fnorm = $f                                    (51)

and the principal point pnorm in normalized image coordinates from (31) by

                                           $px
                                              
                                pnorm =          .                         (52)
                                           $py
  10 https://rchelp.capturingreality.com/en-US/appbasics/reports_fav_cameras.htm




                                          27
Pixel coordinates. It is in pixel coordinates that software that takes computer
vision camera models as input will typically expect to be provided the focal length
and principal point, notably OpenCV and COLMAP. The focal length fpx in pixel
coordinates from (23) is obtained from the reporting system by

                                   fpx = $(scale*f),                                  (53)

where scale is the scaling factor s = max(w, h) from (28), where in turn w and h
are the corresponding image width and height, respectively. The principal point ppx
in pixel coordinates from (24) is obtained from the reporting system by

                                $(scale*px+0.5*width)
                                                          
                       ppx =                                 .                 (54)
                               $(scale*py+0.5*height)

35 mm equivalent. The focal length f35mm in 35 mm equivalent from (34) is
obtained from the reporting system by

                                    f35mm = $(36*f),                                  (55)

and the principal point p35mm in 35 mm equivalent from (35) from

                                       $(36*px)
                                               
                            p35mm =                .                                  (56)
                                       $(36*py)

Lens distortion model coefficients. Lens distortion model coefficients are avail-
able as a function of the lens distortion model chosen (cf. Section 4), and are
obtained from the reporting system by

                                         k1 = $k1,                                    (57)

                                         k2 = $k2,                                    (58)
                                         k3 = $k3,                                    (59)
                                         k4 = $k4,                                    (60)
                                         t1 = $t1,                                    (61)
and
                                         t2 = $t2.                                    (62)
Beware that in case the chosen lens distortion model is the Brown model, Reali-
tyScan’s ordering of the tangential lens distortion coefficients t1 and t2 is reversed
relative to the ordering expected by OpenCV (cf. Section 4). Note that this question
of ordering is taken into account by RealityScan’s OpenCV exporter:
< format id ="{ B5331837 -609 D -4 B12 - A931 -2863653 d19F7 }" mask ="*. csv "
     ,→ descID ="8390" desc =" OpenCV - compliant Internal / External Camera
     ,→ Parameters " writer =" cvs " u nd is t or tI ma g es ="0" exportImages ="0"
     ,→ supp ortsGeo ref ="0" requires =" component " >




                                             28
     < body ># name , tx , ty , tz , R00 , R01 , R02 , R10 , R11 , R12 , R20 , R21 , R22 , f_pix , px_pix ,
           ,→ py_pix , k1 , k2 , t2 , t1 , k3 , k4 ( R = [ Rij ] provided in row major
           ,→ ordering and t = ( tx , ty , tz ) are the rotation matrix R and the
           ,→ translation vector t of the pose (R , t ) of the camera ; focal
           ,→ length f and principal point ( px , py ) provided in pixel units ;
           ,→ Brown lens distortion model coefficients provided in OpenCV
           ,→ ordering )
$Expo rtCamer as ( $ ( imageName ) $ ( imageExt ) ,$ ( tX ) ,$ ( tY ) ,$ ( tZ ) ,$ ( R00 ) ,$ ( R01 ) ,
     ,→ $ ( R02 ) ,$ ( R10 ) ,$ ( R11 ) ,$ ( R12 ) ,$ ( R20 ) ,$ ( R21 ) ,$ ( R22 ) ,$ ( f * scale ) ,
     ,→ $ ( px * scale + width *0.5) ,$ ( py * scale + height *0.5) ,$ ( k1 ) ,$ ( k2 ) ,$ ( t2 ) ,$ ( t1 ) ,
     ,→ $ ( k3 ) ,$ ( k4 ) )
     </ body >
</ format >



A.2       Extrinsics (Geospatial Components)
Elements of the estimated extrinsics—the rotation R as a 3 × 3 matrix or as yaw,
pitch, roll or omega, phi, kappa angles or the translation t of the pose (R, t), the
camera center C, or the residual between C and the corresponding camera position
prior—of cameras of geospatial components can be exported in various coordinate
systems. The full gamut of these coordinate systems is what in this document are
referred to as component coordinates, Euclidean coordinates, geodetic coordinates,
omega, phi, kappa angles, point coordinates, and output coordinates, and are further
detailed below.
    Internally, it is using the PROJ library11 [4] that RealityScan carries out trans-
formations between geodetic coordinates and Euclidean or output coordinates. It
is in this manner that RealityScan ensures that these transformations adhere to
established standards.

Component coordinates (ENU). The world coordinate system in terms of which
a component’s estimated camera poses are expressed is an East, North, Up (ENU)
coordinate system. This coordinate system is computed relative to a reference
point—termed the ‘anchor’—situated around the center of the scene (cf. Fig-
ure 13c), with points expressed in units of meters. Since points are thus expressed
relative to the anchor, the coordinates of those points are substantially smaller than
those of the same points expressed in the ‘Euclidean’ coordinate system. Addi-
tionally, it is because a component is expressed in ENU that the reconstruction is
oriented for visualization in RealityScan’s UI such that north faces upwards in the
viewport and east rightwards. The 3 × 3 rotation matrix RENU is obtained from the
reporting system by
                                   $aR11 $aR12 $aR13
                                                          

                         RENU = $aR21 $aR22 $aR23 .                             (63)
                                   $aR31 $aR32 $aR33
The camera center CENU is obtained from the reporting system by
                                        $aX
                                           

                             CENU = $aY .                                                             (64)
                                        $aZ
  11 https://proj.org/




                                                     29
The translation vector tENU is not available via the reporting system, but can be
computed according to tENU = −RENU CENU in accordance with (10). The a prefix
in the variables of this paragraph refers to ‘anchored’, referring in turn to the fact
an ‘anchor’ is used to compute the corresponding ENU coordinate system.

Euclidean coordinates (ECEF). What is called the Euclidean coordinate system
is for geospatial components the Earth-centered Earth-fixed (ECEF)12 coordinate
system. In this system, points are expressed in terms of the metric right-handed 3D
Cartesian coordinate system centered on the WGS 84 ellipsoid, with its XECEF - and
YECEF -axes in the equatorial plane and the positive XECEF -axis passing through
the prime meridian (cf. Figure 13b). The camera center CECEF is obtained from
the reporting system by

                                 $euclidX          $euclidx
                                                          

                    CECEF = $euclidY = $euclidy ,                          (65)
                                 $euclidZ          $euclidz

such that the variables $(euclidx), $(euclidy), and $(euclidz) are deprecated
since 2.12.2020. The 3 × 3 rotation matrix RECEF is obtained from the reporting
system by
                               $ecR00 $ecR01 $ecR02
                                                        

                     RECEF = $ecR10 $ecR11 $ecR12 .                      (66)
                               $ecR20 $ecR21 $ecR22
The translation vector tECEF is not available via the reporting system, but can be
computed according to tECEF = −RECEF CECEF in accordance with (10).

Geodetic coordinates (WGS 84). In geodetic coordinates, a point is expressed it
terms of longitude λ and latitude ϕ in degrees, and height h—i.e., ‘altitude’—above
the ellipsoid in meters, with the ellipsoid in question the WGS 84 ellipsoid centered
on the Earth’s center of mass (cf. Figure 13a).13 The camera center CWGS =
(λ, ϕ, h) expressed in geodetic coordinates is obtained from the reporting system by

                                               $lon
                                                  

                                 CWGS = $lat .                                 (67)
                                               $alt


Euler angles (local). Local—i.e., per-camera—yaw, pitch, roll (cf. Section 5.1.1)
is obtained from the Reporting System using the variables $geoYaw, $geoPitch,
and $geoRoll in conjunction with EulerFormat="zyx", as in the following ex-
porter:
  12 The Earth-centered Earth-fixed (ECEF) coordinate system corresponds to EPSG 4978 (cf.

https://epsg.io/4978).
  13 This geodetic coordinate system corresponds to EPSG 4326 (cf. https://epsg.io/4326).




                                           30
< format id ="{121 D2018 -5016 -4 A4D -95 BB -46382 F54CD64 }" mask ="*. csv "
      ,→ descID ="8368" desc =" Comma - separated , Name , X / Lon , Y / Lat , Z / Alt , Yaw ,
      ,→ Pitch , Roll " writer =" cvs " requi resGeore f ="1" requires =" component " >
      < body EulerFormat =" zyx " ># cameras $ ( cameraCount )
# name , X / Lon , Y / Lat , Z / Alt , yaw , pitch , roll
$Expo rtCamer as ( $ ( imageName ) $ ( imageExt ) ,$ ( x ) ,$ ( y ) ,$ ( z ) ,$ ( geoYaw ) ,$ ( geoPitch ) ,
      ,→ $ ( geoRoll )
) </ body >
</ format >

Local omaga, phi, kappa (cf. Section 5.2.1) is obtained from the Reporting Sys-
tem using the variables $geoOmega, $geoPhi, and $geoKappa as in the following
exporter, here in conjunction with EulerFormat="xyz":
< format id ="{ B3EE1544 -1 D64 -4 C22 - A47D - FC9F78C107B7 }" mask ="*. csv "
      ,→ descID ="8367" desc =" Comma - separated , Name , X / Lon , Y / Lat , Z / Alt ,
      ,→ Omega , Phi , Kappa " writer =" cvs " r equires Georef ="1"
      ,→ requires =" component " >
      < body EulerFormat =" xyz " ># cameras $ ( cameraCount )
# name , X / Lon , Y / Lat , Z / Alt , omega , phi , kappa
$Expo rtCamer as ( $ ( imageName ) $ ( imageExt ) ,$ ( x ) ,$ ( y ) ,$ ( z ) ,$ ( geoOmega ) ,$ ( geoPhi ) ,
      ,→ $ ( geoKappa )
) </ body >
</ format >



Euler angles (global). Global—i.e., per-component—yaw, pitch, roll (cf. Sec-
tion 5.1.2) is obtained from the Reporting System using the variables $yaw, $pitch,
and $roll as in the above exporter for local yaw, pitch, roll (replacing $geoYaw,
$geoPitch, $geoRoll with $yaw, $pitch, $roll, respectively). Global omega,
phi, kappa (cf. Section 5.2.2) is obtained from the Reporting System using the
variables $omega, $phi, and $kappa as in the above exporter for local omega, phi,
kappa (replacing $geoOmega, $geoPhi, $geoKappa with $omega, $phi, $kappa,
respectively).

Point coordinates. Given a camera with an associated camera position prior,
let CGT,pt be that camera position prior, expressed in its input coordinate system.
It is this coordinate system that is meant by the ‘point’ coordinate system associated
with the camera. Moreover, let CENU be the corresponding estimated camera center
expressed in the ENU coordinate system of the associated geospatial component,
and let Cpt be the estimated camera center, expressed in the input coordinate
system—i.e., component coordinate system—associated with the camera position
prior. This point Cpt is obtained from the reporting system by

                                          $xInpCS
                                                   

                                 Cpt = $yInpCS .                                (68)
                                          $zInpCS

If the input coordinate system of the camera position prior is a projected coordinate
system14 (e.g., UTM), then an ‘error’ vector r is computed with respect to that
  14 Such coordinate systems express points in terms of units of measurement like meters or feet.

This is in contrast to geodetic coordinate systems—such as WGS 84 (EPSG 4326)—which express
their points in terms of angles.



                                                     31
Algorithm 1 Obtaining the row vectors rout,1 , rout,2 , rout,3 of Rout from the camera
center CECEF and the row vectors rECEF,1 , rECEF,2 , rECEF,3 of RECEF , given the
transformation T from ECEF to the chosen output coordinate system.
 1: rout,1 ← T (CECEF + rECEF,1 ) − T (CECEF )                      ▷ T (CECEF ) = Cout
 2: rout,2 ← T (CECEF + rECEF,2 ) − T (CECEF )
 3: rout,1 ← rout,1 /∥rout,1 ∥                            ▷ normalize rout,1 to unit length
 4: rout,3 ← rout,1 × rout,2                   ▷ obtain rout,3 orthogonal to rout,1 , rout,2
 5: rout,3 ← rout,3 /∥rout,3 ∥
 6: rout,2 ← rout,3 × rout,1
 7: rout,2 ← rout,1 /∥rout,2 ∥



input coordinate system:
                                   e = CGT,pt − Cpt ,                                  (69)
where Cpt and CGT,pt are the estimated camera center and the camera position
prior, respectively, both expressed in the input coordinate system of the camera
position prior, i.e., in ‘point’ coordinates. The error vector e is obtained from the
reporting system by
                                       $priorErrorX
                                                    

                                e = $priorErrorY .                             (70)
                                       $priorErrorZ
If, however, the camera position prior is expressed in geodetic coordinates—i.e., in
terms of longitude and latitude, cf. Figure 13a—then the error vector e provided
via (70) is
                            e = CGT,ECEF − CECEF ,                             (71)
where CECEF and CGT,ECEF are the estimated camera center and the camera
position prior, respectively, both expressed in ECEF. Finally, if the given camera
has no associated camera position prior, the error vector provided via (70) is e =
(−1, −1, −1)⊤ , indicating the absence of a camera position prior for the camera in
question. The Euclidean distance ∥e∥2 is provided via the reporting system by

                                 ∥e∥2 = $priorError3D.                                 (72)


Output coordinates. The camera’s extrinsics in output coordinates are expressed
in terms of the coordinate system specified as the ‘output coordinate system’ via
RealityScan’s UI. Let T : R3 → R3 be the function that transforms a 3D point
from ECEF (cf. Figure 13b) to the chosen output coordinate system. The camera
center Cout = T (CECEF ) in output coordinates is obtained by transforming CECEF
from (65) to the output coordinate system. This transformed camera center is
obtained from the reporting system by

                                           $x
                                          

                                 Cout = $y .                               (73)
                                           $z

                                            32
Recall that the row (and column) vectors of a rotation matrix are unit vectors. Let
rECEF,1 , rECEF,2 , rECEF,3 be these three unit row vectors for RECEF , such that
                                          ⊤       
                                           rECEF,1
                               RECEF = r⊤  ECEF,2 ,
                                                                               (74)
                                           r⊤
                                            ECEF,3

and let rout,1 , rout,2 , rout,3 —obtained from the row vectors of RECEF according to
Algorithm 1—be the corresponding unit row vectors for Rout 15 :
                                              ⊤ 
                                              rout,1
                                     Rout = r⊤out,2 .
                                                                                (75)
                                              r⊤
                                               out,3

The resulting 3 × 3 rotation matrix Rout of the pose (Rout , tout ) is obtained from
the reporting system by
                                  $R00 $R01 $R02
                                                    

                         Rout = $R10 $R11 $R12 .                               (76)
                                  $R20 $R21 $R22
The translation vector tout = −Rout Cout by (10) of the pose (Rout , tout ) is obtained
from the reporting system by
                                          $tx
                                             

                                 tout = $ty .                                    (77)
                                          $tz

A.3     Extrinsics (Non-geospatial Components)
Elements of the extrinsics of cameras of non-geospatial components can be exported
in output coordinates. These are the rotation Rout as a 3 × 3 matrix or the trans-
lation tout of the pose (Rout , tout ) ∈ R3 , or the camera center Cout = −R⊤
                                                                            out tout ,
as further detailed below.

Output coordinates. The camera’s extrinsics for non-geospatial components are
provided in output coordinates. This camera center Cout in output coordinates is
obtained from the reporting system by
                                         $x
                                         

                                 Cout = $y .                             (78)
                                         $z
The 3 × 3 rotation matrix Rout is obtained from the reporting system by
                                  $R00 $R01 $R02
                                                     

                         Rout = $R10 $R11 $R12 ,                                (79)
                                  $R20 $R21 $R22
  15 Algorithm 1 makes sense only for projected output coordinate systems.




                                              33
Figure 17: Exporting estimated camera geometry in XMP format in RealityScan,
by clicking Export:XMP Files via the UI’s ALIGNMENT ribbon. A variant of this
XMP exporter capable of exporting XMPs for undistorted images is available in
Export:Registration.


Finally, the translation vector tout = −R⊤out Cout by (10) is obtained from the
reporting system by
                                         $tx
                                             

                                 tout = $ty .                            (80)
                                         $tz


Euler angles (global). Global—i.e., per-component—yaw, pitch, roll (cf. Sec-
tion 5.1.2) and omega, phi, kappa (cf. Section 5.2.2) are obtained as described
in Section A.2. Local–i.e., per camera—Euler angles are not supported for non-
geospatial components.


B      RealityScan XMP Files
Extensible Metadata Platform (XMP) is an XML-based open standard for stor-
ing metadata for digital documents, originally put forward by Adobe. An XMP file
produced by RealityScan16 is a file that encodes the estimated camera geometry cor-
responding to a single image. Export of XMPs in invoked via the Export:Metadata
(XMP) button in the ALIGNMENT ribbon of RealityScan (cf. Figure 17), and pro-
duces an XMP file per input image in the directory where the input images are
situated. The typical form of such a RealityScan XMP file—with all tags prefixed
with xcr: treated as optional—is exemplified by:
<x : xmpmeta xmlns : x =" adobe : ns : meta /" >
   < rdf : RDF xmlns : rdf =" http :// www . w3 . org /1999/02/22 - rdf - syntax - ns #" >
      < rdf : Description xcr : Version ="4"
           xmlns : xcr =" http :// www . c a p t u r i n g r e a l i t y . com / ns / xcr /1.1#"
           xcr : C a l i b r a t i o n P r i o r =" initial | exact "
           xcr : C a l i b r a t i o n G r o u p =" -1" xcr : Di s to rt io n Gr ou p =" -1"
           xcr : Di st o rt io n Mo de l =" none | perspective | division | brown3 | brown4 | brown3t2 | brown4t2 "
           xcr : Fo ca l Le ng t h3 5m m ="f35mm " xcr : Skew ="0" xcr : AspectRatio ="1"
           xcr : Pr in c ip al P oi nt U ="x0,norm " xcr : P ri nc i pa lP oi n tV ="y0,norm "
           xcr : PosePrior =" initial | exact | locked "
           xcr : Coordinates =" absolute | relative | rigid "
           xcr : InMeshing ="0|1" xcr : InTexturing ="0|1" >
         < xcr : Rotation >R11 R12 R13 R21 R22 R23 R31 R32 R33 </ xcr : Rotation >
         < xcr : Position >X Y Z </ xcr : Position >
         < xcr : DistortionCoeficients >k1 k2 k3 k4 t1 t2 </ xcr : DistortionCoeficients >

  16 https://rchelp.capturingreality.com/en-US/tools/xmpalign.htm




                                                  34
Figure 18: xcr:CalibrationPrior. Setting ‘Prior’ to ‘Approximate’ for both
the Prior calibration and the Prior lens distortion for an image in the UI cor-
responds to setting the corresponding XMP file’s xcr:CalibrationPrior to
initial; setting ‘Prior’ to ‘Fixed’ for both the Prior calibration and the Prior
lens distortion corresponds to setting xcr:CalibrationPrior to exact. The
xcr:CalibrationPrior tag impacts the XML tags corresponding to intrin-
sics parameters provided in the XMP file, i.e., xcr:DistortionCoeficients,
xcr:FocalLength35mm, xcr:Skew, xcr:AspectRatio, xcr:PrincipalPointU,
and xcr:PrincipalPointV. Note that there is no xcr:DistortionPrior tag.


       </ rdf : Description >
   </ rdf : RDF >
</ x : xmpmeta >



xcr:CalibrationPrior. The value set to this tag impacts the XML tags cor-
responding to intrinsics parameters17 provided in the XMP file. For intrinsics pa-
rameters for which there is no tag provided, the value has no effect. If the value is
set to initial or exact, then each intrinsics parameter for which an intrinsics tag
is provided in the XMP is initialized in accordance with the intrinsics tag’s value.
In the case of initial, those parameters are allowed to undergo change during
alignment; in the case of exact, they are not. If the xcr:CalibrationPrior
tag is omitted, then all intrinsics tags provided in the XMP are ignored. Setting
xcr:CalibrationPrior to initial corresponds to setting ‘Prior’ to ‘Approxi-
mate’ for both the Prior calibration and the Prior lens distortion for the correspond-
ing image in the UI; setting it to exact corresponds to setting ‘Prior’ to ‘Fixed’ for
both the Prior calibration and the Prior lens distortion (cf. Figure 18).

xcr:CalibrationGroup. Although a value is exported by RealityScan, the value
set to this tag is currently ignored by RealityScan when importing an XMP.
  17 The  ‘intrinsics parameters’ refer to the lens distortion model coefficients
(xcr:DistortionCoeficients), the focal length (xcr:FocalLength35mm), the skew (xcr:Skew),
the aspect ratio (xcr:AspectRatio), and the principal point (xcr:PrincipalPointU and
xcr:PrincipalPointV).


                                           35
Table 1: Possible values of xcr:DistortionModel. The underlying lens distortion
models—division and Brown—are described in Section 4.

       xcr:DistortionModel       Description
                                 no distortion (i.e., ideal frontal pinhole camera)
       none or perspective
                                 division model with a single coefficient k1
       division
                                 Brown model with three radial coefficients k1 , k2 , k3
       brown3
                                 Brown model with four radial coefficients k1 , k2 , k3 , k4
       brown4
                                 Brown model with three radial coefficients k1 , k2 , k3 and
       brown3t2
                                 two tangential coefficients t1 , t2
                                 Brown model with four radial coefficients k1 , k2 , k3 , k4
       brown4t2
                                 and two tangential coefficients t1 , t2




xcr:DistortionGroup. Although a value is exported by RealityScan, the value
set to this tag is currently ignored by RealityScan when importing an XMP.

xcr:DistortionModel. The value can be set to the identifier of one of Real-
ityScan’s supported lens distortion models (cf. Section 4), or to an ideal frontal
pinhole camera (i.e., a camera free of lens distortion effects). The seven sup-
ported identifiers are listed in Table 1. The coefficients corresponding to the
chosen lens distortion model are provided via the xcr:DistortionCoeficients
tag. If the value of xcr:DistortionModel is set to one of these seven identifiers
but the xcr:DistortionCoeficients tag is omitted, or if it is set to none or
perspective, or if the xcr:DistortionModel tag is omitted, then behavior falls
back to xcr:DistortionModel being set to none.

xcr:FocalLength35mm. The value is set to the focal length f35mm in 35 mm
equivalent from (34). If the xcr:FocalLength35mm tag is omitted, then f35mm is
initialized to 1.2 × 36 = 43.2 if a prior focal length cannot be obtained from via
Exif tags in the corresponding image metadata.

xcr:PrincipalPointU. The value is set to the x-component x0,norm of the prin-
cipal point pnorm = (x0,norm , y0,norm )⊤ in normalized image coordinates from (31).
If the xcr:PrincipalPointU tag is omitted, then x0,norm is initialized to 0.

xcr:PrincipalPointV. The value is set to the y-component y0,norm of the prin-
cipal point pnorm = (x0,norm , y0,norm )⊤ in normalized image coordinates from (31).
If the xcr:PrincipalPointV tag is omitted, then y0,norm is initialized to 0.

xcr:PosePrior. The value set to this tag impacts the XML tags corresponding
to extrinsics parameters18 provided in the XMP file. For extrinsics parameters for
  18 The ‘extrinsics parameters’ give the pose (R
                                                 out , tout ) in output coordinates of the corre-
sponding camera, and refer to the rotation Rout (xcr:Rotation) and the camera center Cout =
−R⊤out tout (xcr:Position). Note that tout = −Rout Cout .



                                               36
Figure 19: Setting an XMP file’s xcr:posePrior to exact corresponds to ... todo.

Algorithm 2 Orthogonalization of the row vectors r1 , r2 , r3 of the 3 × 3 rotation
matrix R read in by RealityScan via xcr:Rotation in an XMP file.
 1: r1 ← r1 /∥r1 ∥                                               ▷ normalize r1 to unit length
 2: r3 ← r1 × r2                                              ▷ obtain r3 orthogonal to r1 , r2
 3: r3 ← r3 /∥r3 ∥
 4: r2 ← r3 × r1
 5: r2 ← r1 /∥r2 ∥



which there is no tag provided, the value has no effect. If the value is set to
initial, exact, or locked, then each extrinsics parameter for which an extrinsics
tag is provided in the XMP is initialized in accordance with the extrinsics tag’s value.
In the case of locked, those parameters are not allowed to undergo any change
during alignment whatsoever.

xcr:Coordinates. The value can be set to one of absolute, relative, or
rigid. Defaults to absolute. If set to either of relative or rigid, then
an xcr:ComponentId tag must be provided.19 If xcr:Coordinates is set to
relative or rigid and an xcr:ComponentId tag is not present, then the value
of xcr:Coordinates is overridden to absolute.

xcr:InMeshing. If the value is set to 0, the corresponding image shall not be
used in meshing; if set to 1, it shall.

xcr:InTexturing. If the value is set to 0, the corresponding image shall not be
used in texturing; if set to 1, it shall.
   19 The value the xcr:ComponentId tag is a string containing the unique hyphenated GUID

in curly brackets of the component to which all corresponding cameras are to belong, and
must be provided with the same value in each corresponding camera’s XMP file. For exam-
ple, xcr:ComponentId="{70F5304C-4695-4299-8F99-2D331BE3EB98}". For an online hyphen-
ated GUID generator, cf. https://guidgenerator.com/.




                                           37
xcr:Rotation. The value is set to nine space-separated numbers, which are the
elements of the 3 × 3 rotation matrix Rout in output coordinates (cf. paragraph on
output coordinates in Appendix A.2 or A.3, depending on whether the underlying
component is geospatial or not), written out in row-major order:
                                                   
                                    R11 R12 R13
                           Rout = R21 R22 R23  .                            (81)
                                    R31 R32 R33

When reading in the value of xcr:Rotation from an XMP file to a 3 × 3 rotation
matrix R, RealityScan orthogonalizes the row vectors of R in accordance with Algo-
rithm 2. For this reason, even if xcr:PosePrior is set to exact or locked, the
rotation matrix R of the corresponding camera following alignment may not exactly
match with the entries in xcr:Rotation.

xcr:Position. The value is set to three space-separated numbers, which are
                                                                       ⊤
the elements of the camera center Cout = −R⊤      out tout = (X, Y, Z)   in output
coordinates (cf. paragraph on output coordinates in Appendix A.2 or A.3, depending
on whether the underlying component is geospatial or not).

xcr:DistortionCoeficients. The value is set to six space-separated numbers,
which are the lens distortion model coefficients corresponding to the lens distortion
model indicated by xcr:DistortionModel (cf. Section 4 and Table 1). Coefficients
that are not applicable with respect to the indicated lens distortion model are set
to zero.20 Beware that for xcr:DistortionModel set to brown3t2 or brown4t2,
the tangential coefficients t1 , t2 are swapped relative to the OpenCV convention
(cf. Section 4).




  20 For example, brown3t2 would set k
                                         4 to 0 in the XMP.



                                               38
Index
35 mm equivalent, 11, 28                    $width, 28
                                            component coordinates, 29
back-projection, 12                            $aR11, 29
                                               $aR12, 29
camera coordinates, 7                          $aR13, 29
    projection, 7                              $aR21, 29
component                                      $aR22, 29
    georeferenced, 19                          $aR23, 29
    geospatial, 19                             $aR31, 29
                                               $aR32, 29
Euler angles, 2                                $aR33, 29
     elementary rotations, 2                   $aX, 29
     global, 22, 26                            $aY, 29
     local, 22, 26                             $aZ, 29
                                            distortion coefficients, 28
image coordinates, 9
                                               $k1, 28
    projection, 10
                                               $k2, 28
                                               $k3, 28
lens distortion, 14
                                               $k4, 28
     Brown model, 16
                                               $t1, 28
        radial coefficients, 16
                                               $t2, 28
        tangential coefficients, 16
                                            Euclidean coordinates, 30
     divison model, 18
                                               $ecR00, 30
normalized image coordinates, 11, 27           $ecR01, 30
    projection, 10                             $ecR02, 30
                                               $ecR10, 30
OpenCV, 16, 38                                 $ecR11, 30
    distortion coefficients, 16                $ecR12, 30
                                               $ecR20, 30
pinhole camera, 6                              $ecR21, 30
     frontal, 7                                $ecR22, 30
pixel coordinates, 10, 28                      $euclidX, 30
points, 2                                      $euclidY, 30
     Euclidean, 2                              $euclidZ, 30
     homogenous, 2                             $euclidx, 30
     inhomogenous, 2                           $euclidy, 30
     projective, 2                             $euclidz, 30
                                            Euler angles (global), 31, 34
Reporting System                               $kappa, 31
    $f, 27                                     $omega, 31
    $height, 28                                $phi, 31
    $px, 27                                    $yaw, 31
    $py, 27                                 Euler angles (local), 30
    $scale, 28                                 $geoKappa, 31

                                       39
      $geoOmega, 31                        Reporting System (paRSer), 26
      $geoPhi, 31                          rigid body transformations, 3
      $geoPitch, 30                             inverse, 4
      $geoRoll, 30
      $geoYaw, 30                          XMP, 34
      $pitch, 31                              xcr:CalibrationGroup, 35
      $roll, 31                               xcr:CalibrationPrior, 35
    geodetic coordinates, 30                     exact, 35
      $alt, 30                                   initial, 35
      $lat, 30                                xcr:Coordinates, 37
      $lon, 30                                   absolute, 37
    output coordinates, 32, 33                   relative, 37
      $R00, 33                                   rigid, 37
      $R01, 33                                xcr:DistortionCoeficients,
      $R02, 33                                     38
      $R10, 33                                xcr:DistortionGroup, 36
      $R11, 33                                xcr:DistortionModel, 36
      $R12, 33                                   brown3t2, 36
      $R20, 33                                   brown3, 36
      $R21, 33                                   brown4t2, 36
      $R22, 33                                   brown4, 36
      $tx, 33, 34                                divison, 36
      $ty, 33, 34                                none, 36
      $tz, 33, 34                                perspective, 36
      $x, 32, 33                              xcr:FocalLength35mm, 36
      $y, 32, 33                              xcr:InMeshing, 37
      $z, 32, 33                              xcr:InTexturing, 37
    point coordinates, 31                     xcr:PosePrior, 36
      $priorError3D, 32                          exact, 37
      $priorErrorX, 32                           initial, 37
      $priorErrorY, 32                           locked, 37
      $priorErrorZ, 32                        xcr:Position, 38
      $xInpCS, 31                             xcr:PrincipalPointU, 36
      $yInpCS, 31                             xcr:PrincipalPointV, 36
      $zInpCS, 31                             xcr:Rotation, 38


References
[1] Andrew Harltey and Andrew Zisserman. Multiple view geometry in computer
    vision. Cambridge University Press, Cambridge, 2nd edition, 2006.

[2] Benjamin Brand, Michel Bätz, and Joachim Keinert. CAMORPH: A tool-
    box for conversion between camera parameter conventions. The International
    Archives of the Photogrammetry, Remote Sensing and Spatial Information Sci-
    ences, 48:29–36, 2022.


                                      40
[3] M Bäumker and FJ Heimes. New calibration and computing method for direct
    georeferencing of image and scanner data using the position and angular data
    of an hybrid inertial navigation system. In OEEPE Workshop, Integrated Sensor
    Orientation, pages 1–17, 2001.
[4] Gerald I Evenden. A comprehensive library of cartographic projection functions
    (preliminary draft). Falmouth, MA, USA, page 43, 2008.
[5] DJI. Flight control - DJI mobile SDK documentation, 2018. URL: https:
    //developer.dji.com/mobile-sdk/documentation/introduction/
    flightController_concepts.html.




                                       41
