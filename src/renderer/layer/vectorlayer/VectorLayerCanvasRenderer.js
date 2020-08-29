import { getExternalResources } from '../../../core/util/resource';
import VectorLayer from '../../../layer/VectorLayer';
import OverlayLayerCanvasRenderer from './OverlayLayerCanvasRenderer';
import PointExtent from '../../../geo/PointExtent';
import { isNil } from '../../../core/util';

const TEMP_EXTENT = new PointExtent();

/**
 * @classdesc
 * Renderer class based on HTML5 Canvas2D for VectorLayers
 * @protected
 * @memberOf renderer
 * @name VectorLayerCanvasRenderer
 * @extends renderer.OverlaylayerCanvasRenderer
 * @param {VectorLayer} layer - layer to render
 */
class VectorLayerRenderer extends OverlayLayerCanvasRenderer {

    checkResources() {
        const resources = super.checkResources.apply(this, arguments);
        let style = this.layer.getStyle();
        if (style) {
            if (!Array.isArray(style)) {
                style = [style];
            }
            style.forEach(s => {
                const res = getExternalResources(s['symbol'], true);
                for (let i = 0, l = res.length; i < l; i++) {
                    if (!this.resources.isResourceLoaded(res[i])) {
                        resources.push(res[i]);
                    }
                }
            });
        }
        return resources;
    }

    needToRedraw() {
        const map = this.getMap();
        if (map.isInteracting() && this.layer.options['enableAltitude']) {
            return true;
        }
        // don't redraw when map is zooming without pitch and layer doesn't have any point symbolizer.
        if (map.isZooming() && !map.isRotating() && !map.getPitch() && !this._hasPoint && this.layer.constructor === VectorLayer) {
            return false;
        }
        return super.needToRedraw();
    }

    /**
     * render layer
     * @param  {Geometry[]} geometries   geometries to render
     * @param  {Boolean} ignorePromise   whether escape step of promise
     */
    draw() {
        if (!this.getMap()) {
            return;
        }
        if (!this.layer.isVisible() || this.layer.isEmpty()) {
            this.clearCanvas();
            this.completeRender();
            return;
        }

        this.prepareCanvas();

        this.drawGeos();

        this.completeRender();
    }

    isBlank() {
        if (!this.context) {
            return false;
        }
        return !this.context.canvas._drawn;
    }

    drawOnInteracting() {
        if (!this._geosToDraw) {
            return;
        }
        this._updateDisplayExtent();
        const map = this.getMap();
        //refresh geometries on zooming
        const count = this.layer.getCount();
        const res = this.getMap().getResolution();
        if (map.isZooming() &&
            map.options['seamlessZoom'] && this._drawnRes !== undefined && res > this._drawnRes * 1.5 &&
            this._geosToDraw.length < count || map.isMoving() || map.isInteracting()) {
            this.prepareToDraw();
            this.forEachGeo(this.checkGeo, this);
            this._drawnRes = res;
        }
        this._updateMapStateCache();
        let idx = 0;
        const points = this._batchConversionMarkers();
        for (let i = 0, l = this._geosToDraw.length; i < l; i++) {
            const geo = this._geosToDraw[i];
            if (geo.getType() === 'Point') {
                geo._cPoint = points[idx];
                idx++;
            }
            if (!geo.isVisible()) {
                delete geo._cPoint;
                continue;
            }
            geo._paint(this._displayExtent);
            delete this._geosToDraw[i]._cPoint;
        }
    }

    /**
     * Show and render
     * @override
     */
    show() {
        this.layer.forEach(function (geo) {
            geo._repaint();
        });
        super.show.apply(this, arguments);
    }

    forEachGeo(fn, context) {
        this.layer.forEach(fn, context);
    }

    drawGeos() {
        this._drawnRes = this.getMap().getResolution();
        this._updateDisplayExtent();
        this.prepareToDraw();

        this.forEachGeo(this.checkGeo, this);
        this._updateMapStateCache();
        let idx = 0;
        const points = this._batchConversionMarkers();
        for (let i = 0, len = this._geosToDraw.length; i < len; i++) {
            if (this._geosToDraw[i].getType() === 'Point') {
                this._geosToDraw[i]._cPoint = points[idx];
                idx++;
            }
            this._geosToDraw[i]._paint();
            delete this._geosToDraw[i]._cPoint;
        }
    }

    prepareToDraw() {
        this._hasPoint = false;
        this._geosToDraw = [];
    }

    checkGeo(geo) {
        if (!geo || !geo.isVisible() || !geo.getMap() ||
            !geo.getLayer() || (!geo.getLayer().isCanvasRender())) {
            return;
        }

        const painter = geo._getPainter();
        const extent2D = painter.get2DExtent(this.resources, TEMP_EXTENT);
        if (!extent2D || !extent2D.intersects(this._displayExtent)) {
            return;
        }
        if (painter.hasPoint()) {
            this._hasPoint = true;
        }
        this._geosToDraw.push(geo);
    }

    onZoomEnd() {
        delete this.canvasExtent2D;
        super.onZoomEnd.apply(this, arguments);
    }

    onRemove() {
        this.forEachGeo(function (g) {
            g.onHide();
        });
        delete this._geosToDraw;
    }

    onGeometryPropertiesChange(param) {
        if (param) {
            this.layer._styleGeometry(param['target']);
        }
        super.onGeometryPropertiesChange(param);
    }

    _updateDisplayExtent() {
        let extent2D = this.canvasExtent2D;
        if (this._maskExtent) {
            if (!this._maskExtent.intersects(extent2D)) {
                this.completeRender();
                return;
            }
            extent2D = extent2D.intersection(this._maskExtent);
        }
        this._displayExtent = extent2D;
    }

    identify(coordinate, options = {}) {
        const geometries = this._geosToDraw;
        if (!geometries) {
            return [];
        }
        return this.layer._hitGeos(geometries, coordinate, options);
    }

    _updateMapStateCache() {
        const map = this.getMap();
        const offset = map._pointToContainerPoint(this.southWest)._add(0, -map.height);
        const resolution = map.getResolution();
        const pitch = map.getPitch();
        const bearing = map.getBearing();
        const glScale = map.getGLScale();
        const glZoom = map.getGLZoom();
        const containerExtent = map.getContainerExtent();
        const _2DExtent = map._get2DExtent();
        const glExtent = map._get2DExtent(glZoom);
        this.mapStateCache = {
            resolution,
            pitch,
            bearing,
            glScale,
            glZoom,
            _2DExtent,
            glExtent,
            containerExtent,
            offset
        };
        return this;
    }

    // Better performance of batch coordinate conversion
    _batchConversionMarkers() {
        const points = [], altitudes = [];
        const placement = 'center';
        const altitudeCache = {};
        for (let i = 0, len = this._geosToDraw.length; i < len; i++) {
            const type = this._geosToDraw[i].getType();
            if (type === 'Point') {
                const painter = this._geosToDraw[i]._painter;
                const point = painter.getRenderPoints(placement)[0][0];
                const altitude = this._geosToDraw[i].getAltitude();
                if (isNil(altitudeCache[altitude])) {
                    altitudeCache[altitude] = painter.getAltitude();
                }
                points.push(point);
                altitudes.push(altitudeCache[altitude]);
            }
        }
        if (points.length === 0) {
            return [];
        }
        const map = this.getMap();
        const glZoom = map.getGLZoom();
        const pts = map._pointsToContainerPoints(points, glZoom, altitudes);
        return pts;
    }
}

VectorLayer.registerRenderer('canvas', VectorLayerRenderer);

export default VectorLayerRenderer;
