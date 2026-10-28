// Maquette IFC écrite à la main (STEP), au style des exports ArchiCAD : unités en millimètres,
// quantités de base (Qto_*BaseQuantities), propriétés Pset_WallCommon, ouvertures liées aux murs.
// NB : ce n'est PAS un export réel — à compléter par un fichier ArchiCAD / Revit réel.
export const ifcMaquette = ({ mm = true, avecQuantites = true } = {}) => {
  const L = (v) => (mm ? `${v * 1000}.` : `${v}.`)   // longueur dans l'unité du fichier
  const q = (id, nom, v, type = 'LENGTH') => `#${id}=IFCQUANTITY${type}('${nom}',$,$,${v},$);`
  return `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
/* commentaire */
#1=IFCPROJECT('g1',$,'Villa Test',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3,#4,#5));
#3=IFCSIUNIT(*,.LENGTHUNIT.,${mm ? '.MILLI.' : '$'},.METRE.);
#4=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#5=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#10=IFCBUILDINGSTOREY('s0',$,'RDC',$,$,$,$,$,.ELEMENT.,0.);
#11=IFCBUILDINGSTOREY('s1',$,'R+1',$,$,$,$,$,.ELEMENT.,${L(3)});
#20=IFCWALLSTANDARDCASE('w1',$,'Mur ext. nord',$,$,$,$,$,.STANDARD.);
#21=IFCWALLSTANDARDCASE('w2',$,'Cloison salon',$,$,$,$,$,.STANDARD.);
#22=IFCWALLSTANDARDCASE('w3',$,'Mur R+1',$,$,$,$,$,.STANDARD.);
#23=IFCWALL('w4',$,'Mur sans quantités',$,$,$,$,$,.NOTDEFINED.);
${avecQuantites ? `${q(30, 'Length', L(10))}
${q(31, 'Height', L(3))}
${q(32, 'Width', L(0.2))}
#33=IFCELEMENTQUANTITY('q1',$,'Qto_WallBaseQuantities',$,$,(#30,#31,#32));
${q(34, 'Length', L(4))}
${q(35, 'Height', L(3))}
${q(36, 'Width', L(0.1))}
#37=IFCELEMENTQUANTITY('q2',$,'Qto_WallBaseQuantities',$,$,(#34,#35,#36));
${q(38, 'Length', L(8))}
${q(39, 'Height', L(2.8))}
${q(40, 'Width', L(0.15))}
#41=IFCELEMENTQUANTITY('q3',$,'Qto_WallBaseQuantities',$,$,(#38,#39,#40));
#42=IFCRELDEFINESBYPROPERTIES('r1',$,$,$,(#20),#33);
#43=IFCRELDEFINESBYPROPERTIES('r2',$,$,$,(#21),#37);
#44=IFCRELDEFINESBYPROPERTIES('r3',$,$,$,(#22),#41);` : ''}
#50=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#51=IFCPROPERTYSET('p1',$,'Pset_WallCommon',$,(#50));
#52=IFCRELDEFINESBYPROPERTIES('r4',$,$,$,(#20),#51);
#60=IFCDOOR('d1',$,'P1',$,$,$,$,$,2100.,900.,$,$,$);
#61=IFCWINDOW('f1',$,'F1',$,$,$,$,$,1200.,1200.,$,$,$);
#62=IFCOPENINGELEMENT('o1',$,'op1',$,$,$,$,$,$);
#63=IFCOPENINGELEMENT('o2',$,'op2',$,$,$,$,$,$);
#64=IFCRELVOIDSELEMENT('v1',$,$,$,#20,#62);
#65=IFCRELVOIDSELEMENT('v2',$,$,$,#20,#63);
#66=IFCRELFILLSELEMENT('fl1',$,$,$,#62,#60);
#67=IFCRELFILLSELEMENT('fl2',$,$,$,#63,#61);
${q(68, 'Width', L(0.9))}
${q(69, 'Height', L(2.1))}
#70=IFCELEMENTQUANTITY('qd',$,'Qto_DoorBaseQuantities',$,$,(#68,#69));
#71=IFCRELDEFINESBYPROPERTIES('r5',$,$,$,(#60),#70);
${q(72, 'Width', L(1.2))}
${q(73, 'Height', L(1.2))}
#74=IFCELEMENTQUANTITY('qw',$,'Qto_WindowBaseQuantities',$,$,(#72,#73));
#75=IFCRELDEFINESBYPROPERTIES('r6',$,$,$,(#61),#74);
#80=IFCCOLUMN('c1',$,'P1',$,$,$,#82,$,.COLUMN.);
#81=IFCCOLUMN('c2',$,'P2',$,$,$,#82,$,.COLUMN.);
#82=IFCPRODUCTDEFINITIONSHAPE($,$,(#83));
#83=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#84));
#84=IFCEXTRUDEDAREASOLID(#85,$,$,${L(3)});
#85=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${L(0.2)},${L(0.3)});
${q(86, 'Length', L(3))}
#87=IFCELEMENTQUANTITY('qc',$,'Qto_ColumnBaseQuantities',$,$,(#86));
#88=IFCRELDEFINESBYPROPERTIES('r7',$,$,$,(#80,#81),#87);
#90=IFCSLAB('sl1',$,'Dalle RDC',$,$,$,$,$,.FLOOR.);
#91=IFCSLAB('sl2',$,'Toit',$,$,$,$,$,.ROOF.);
${q(92, 'GrossArea', 80, 'AREA')}
${q(93, 'Depth', L(0.15))}
${q(94, 'GrossVolume', 12, 'VOLUME')}
#95=IFCELEMENTQUANTITY('qs',$,'Qto_SlabBaseQuantities',$,$,(#92,#93,#94));
#96=IFCRELDEFINESBYPROPERTIES('r8',$,$,$,(#90),#95);
${q(97, 'GrossArea', 95, 'AREA')}
#98=IFCELEMENTQUANTITY('qr',$,'Qto_SlabBaseQuantities',$,$,(#97));
#99=IFCRELDEFINESBYPROPERTIES('r9',$,$,$,(#91),#98);
#100=IFCRELCONTAINEDINSPATIALSTRUCTURE('c1',$,$,$,(#20,#21,#23,#60,#61,#80,#81,#90),#10);
#101=IFCRELCONTAINEDINSPATIALSTRUCTURE('c2',$,$,$,(#22,#91),#11);
ENDSEC;
END-ISO-10303-21;
`
}
