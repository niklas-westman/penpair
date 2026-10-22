// penpair: read
const input = previewInput();
const fill = input.root.fills && input.root.fills[0];
return {ok:true,rootId:input.root.id,verification:{
 expected:{color:input.value,opacity:1,fillBinding:null,provenance:input.provenance},
 actual:{color:fill && fill.fillColor,opacity:fill && fill.fillOpacity,fillBinding:input.root.tokens.fill || null,provenance:input.root.getSharedPluginData("penpair","projection")}
}};
