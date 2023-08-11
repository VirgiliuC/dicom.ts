

import { DCMImage, DCMObject } from "./parser";
import Series from "./image/series";

import Renderer  from "./renderer/Renderer";
import { Renderer2D } from "./renderer";
import { ColorMap, makeRainbowPallette, makeRainbowColormap, makeColorPalletteFromMap, makeHotColdColorMap, makeRangeColorMap}  from "./renderer/Utils";
import {IFrameInfo} from "./image/Types";
import FrameInfo from "./image/FrameInfo";

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
	Renderer2D,
	Parser,
	Series,
	DCMObject, 
	DCMImage, 
	makeRainbowPallette, 
	makeRainbowColormap,
	makeColorPalletteFromMap,
	makeHotColdColorMap,
	makeRangeColorMap,
	FrameInfo
};
 export type { ColorMap,IFrameInfo };