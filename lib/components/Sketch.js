//@flow
import React from 'react';
import Expo from 'expo';
import { spriteAsync, PIXI } from '../ExpoPixi';
import { PixelRatio, PanResponder } from 'react-native';

global.__ExpoSketchId = global.__ExpoSketchId || 0;

type Props = {
  strokeColor: number | string,
  strokeWidth: number,
  strokeAlpha: number,
  onChange: () => PIXI.Renderer,
  onReady: () => WebGLRenderingContext,
};

const scale = PixelRatio.get();

function scaled({ locationX: x, locationY: y }) {
  return { x: x * scale, y: y * scale };
}

type Point = {
  x: number,
  y: number,
};

export default class Sketch extends React.Component<Props> {
  lines = [];
  stage: PIXI.Stage;
  graphics;
  points = [];
  lastPoint: Point;
  lastTime: number;
  ease: number = 0.3; // only move 0.3 in the direction of the pointer, this smooths it out
  delay: number = 10;
  panResponder: PanResponder;
  renderer: PIXI.Renderer;

  componentWillMount() {
    global.__ExpoSketchId++;
    this.setupPanResponder();
  }

  setupPanResponder = () => {
    const onEnd = event => {
      this.drawLine(scaled(event), false);

      setTimeout(
        () => this.props.onChange && this.props.onChange(this.renderer),
        1,
      );
    };

    this.panResponder = PanResponder.create({
      onStartShouldSetResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,
      onPanResponderGrant: ({ nativeEvent }) =>
        this.drawLine(scaled(nativeEvent), true),
      onPanResponderMove: ({ nativeEvent }) => {
        const point = scaled(nativeEvent);
        // throttle updates: once for every 10ms
        const time = Date.now();
        const delta = time - this.lastTime;
        if (delta < this.delay) return;
        this.lastTime = time;

        this.drawLine(
          {
            x: this.lastPoint.x + this.ease * (point.x - this.lastPoint.x),
            y: this.lastPoint.y + this.ease * (point.y - this.lastPoint.y),
          },
          false,
        );
      },
      onPanResponderRelease: ({ nativeEvent }) => onEnd(nativeEvent),
      onPanResponderTerminate: ({ nativeEvent }) => onEnd(nativeEvent),
    });
  };

  shouldComponentUpdate = () => false;

  drawLine(point: Point, newLine: boolean) {
    if (!this.renderer || (!newLine && !this.graphics)) {
      return;
    }

    if (newLine) {
      this.lastPoint = point;

      if (this.graphics) {
        this.graphics.points = this.points;
        this.lines.push(this.graphics);
      }

      this.graphics = new PIXI.Graphics();
      this.stage.addChild(this.graphics);

      this.points = [point];
      this.lastTime = 0;
      return;
    }
    this.lastPoint = point;
    this.points.push(point);

    this.graphics.clear();
    for (let i = 0; i < this.points.length; i++) {
      const { x, y } = this.points[i];
      if (i === 0) {
        this.graphics.lineStyle(
          this.props.strokeWidth || 10,
          this.props.strokeColor || 0x000000,
          this.props.strokeAlpha || 1,
        );
        this.graphics.moveTo(x, y);
      } else {
        this.graphics.lineTo(x, y);
      }
    }
    this.graphics.currentPath.shape.closed = false;
    this.graphics.endFill(); /// TODO: this may be wrong: need stroke
    this.renderer._update();
  }

  onContextCreate = async (context: WebGLRenderingContext) => {
    const { strokeWidth, strokeColor, strokeAlpha, ...props } = this.props;

    this.context = context;
    this.stage = new PIXI.Container();

    const getAttributes = context.getContextAttributes || (() => ({}));
    context.getContextAttributes = () => {
      const contextAttributes = getAttributes();
      return {
        ...contextAttributes,
        stencil: true,
      };
    };

    this.renderer = PIXI.autoDetectRenderer(
      context.drawingBufferWidth,
      context.drawingBufferHeight,
      {
        context,
        antialias: true,
        backgroundColor: 'transparent',
        transparent: true,
        autoStart: false,
      },
    );
    this.renderer._update = () => {
      this.renderer.render(this.stage);
      context.endFrameEXP();
    };
    this.props.onReady && this.props.onReady(context);
  };

  onLayout = ({ nativeEvent: { layout: { width, height } } }) => {
    if (this.renderer) {
      const scale = PixelRatio.get();
      this.renderer.resize(width * scale, height * scale);
      this.renderer._update();
    }
  };

  render() {
    return (
      <Expo.GLView
        {...this.panResponder.panHandlers}
        onLayout={this.onLayout}
        key={'Expo.Sketch-' + global.__ExpoSketchId}
        {...this.props}
        onContextCreate={this.onContextCreate}
      />
    );
  }
}
