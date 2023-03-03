

import { DCMImage, DCMObject } from "./parser";
import Series from "./image/series";

import Renderer  from "./renderer/Renderer";
import { ColorMap, makeRainbowPallette, makeRainbowColormap, makeColorPalletteFromMap, makeHotColdColorMap}  from "./renderer/Utils";
import {IFrameInfo} from "./image/Types";

import {
	TransferSyntax,
	SliceDirection,
	Parser,
	parseDcmObj,
	parseImage,
} from "./parser";

export {
	TransferSyntax,
	SliceDirection,
	parseDcmObj,
	parseImage,
	Renderer,
	Parser,
	Series,
	DCMObject, 
	DCMImage, 
	makeRainbowPallette, 
	makeRainbowColormap,
	makeColorPalletteFromMap,
	makeHotColdColorMap
};
 export type { ColorMap,IFrameInfo };