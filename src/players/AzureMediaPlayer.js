import React, { PureComponent } from "react";

import { callPlayer, getSDK, loadCss, loadJs } from "../utils";
import { canPlay } from "../patterns";

const SDK_URL = "https://amp.azure.net/libs/amp/2.3.8/azuremediaplayer.min.js";
const SDK_GLOBAL = "AMP";
const SKIN = "amp-default";

export default class AzureMediaPlayer extends PureComponent {
  static displayName = "AzureMediaPlayer";
  static canPlay = canPlay.amp;
  static forceLoad = true; // Prevent checking isLoading when URL changes

  constructor(props) {
    super(props);
    this.callPlayer = callPlayer;
    this.duration = null;
    this.secondsLoaded = null;
    this.player = null;
    this.video = React.createRef();
  }

  componentDidMount() {
    this.props.onMount && this.props.onMount(this);
    loadCss(
      `https://amp.azure.net/libs/amp/2.3.8/skins/${SKIN}/azuremediaplayer.min.css`
    );
  }

  componentWillUnmount() {
    const player = this.player;
    if (player) {
      try {
        player.removeEventListener(
          window.amp.eventName.waiting,
          this.props.onBuffer
        );
        player.removeEventListener(
          window.amp.eventName.pause,
          this.props.onPause
        );
        player.removeEventListener(
          window.amp.eventName.seeked,
          this.props.onSeek
        );
        player.removeEventListener(
          window.amp.eventName.ended,
          this.props.onEnded
        );
        player.removeEventListener(
          window.amp.eventName.play,
          this.props.onPlay
        );
        player.removeEventListener(
          window.amp.eventName.playing,
          this.props.onBufferEnd
        );
        player.removeEventListener(
          window.amp.eventName.error,
          this.props.onError
        );
        player.removeEventListener(
          window.amp.eventName.loadeddata,
          this.props.onReady
        );
      } catch (e) {
        console.log("ERROR", e.message);
      }
      player.dispose();
    }
  }

  load(url) {
    this.duration = null;

    const promiseLoadjs = loadJs(
      "https://breakdown.blob.core.windows.net/public/amp-vb.plugin.js",
      () => this.player?.videobreakdown !== undefined
    );
    const promiseSDK = getSDK(SDK_URL, SDK_GLOBAL);

    Promise.all([promiseLoadjs, promiseSDK]).then(() => {
      if (window.amp) {
        this.player?.videobreakdown({
          syncTranscript: true,
          syncLanguage: true,
        });
        const {
          hasFirewall,
          nativeControlsForTouch,
          token,
          manifestProxy,
          tracks,
        } = this.props.config;
        if (hasFirewall && AzureHtml5JS?.HttpUtil?.httpRequestWithRetryConfig) {
          const orgFunction = AzureHtml5JS.HttpUtil.httpRequestWithRetryConfig;
          AzureHtml5JS.HttpUtil.httpRequestWithRetryConfig = (
            b,
            c,
            e,
            f,
            g
          ) => {
            if (b.includes("keydelivery") && c === "POST") {
              return orgFunction(b, "GET", e, f, g);
            }
            return orgFunction(b, c, e, f, g);
          };
        }
        this.player = window.amp(this.video.current, {
          nativeControlsForTouch:
            this.props.controls && nativeControlsForTouch === true,
          playsInline: this.props.playsinline,
          controls: this.props.controls,
          muted: this.props.muted,
          autoplay: this.props.playing,
          logo: { enabled: false },
          hotKeys: { enableVolumeScroll: false },
        });

        this.player.addEventListener(
          window.amp.eventName.waiting,
          this.props.onBuffer
        );
        this.player.addEventListener(
          window.amp.eventName.pause,
          this.props.onPause
        );
        this.player.addEventListener(
          window.amp.eventName.seeked,
          this.props.onSeek
        );
        this.player.addEventListener(
          window.amp.eventName.ended,
          this.props.onEnded
        );
        this.player.addEventListener(
          window.amp.eventName.play,
          this.props.onPlay
        );
        this.player.addEventListener(
          window.amp.eventName.error,
          this.props.onError
        );
        this.player.addEventListener(
          window.amp.eventName.playing,
          this.props.onBufferEnd
        );
        const src = this.props.url;
        const listSrc = [];
        if (token) {
          if (!manifestProxy) {
            listSrc.push({
              src,
              type: "application/dash+xml",
              streamingFormats: nativeControlsForTouch ? [] : ["DASH"],
              protectionInfo: [
                {
                  type: "AES",
                  authenticationToken: token,
                },
              ],
            });
          } else {
            listSrc.push({
              src,
              type: "application/vnd.ms-sstr+xml",
              streamingFormats: ["SMOOTH", "DASH"],
              protectionInfo: [
                {
                  type: "AES",
                  authenticationToken: token,
                },
              ],
            });
            let proxySrc = this.props.url;
            if (proxySrc.indexOf("(format=mpd-time-csf,encryption=cbc)") >= 0) {
              proxySrc = proxySrc.replace(
                "(format=mpd-time-csf,encryption=cbc)",
                "(format=m3u8-aapl,encryption=cbc)"
              );
            }
            listSrc.push({
              src: `${manifestProxy}?playbackUrl=${proxySrc}&token=Bearer%3d${token}`,
              type: "application/vnd.apple.mpegurl",
              disableUrlRewriter: true,
            });
          }
        } else {
          listSrc.push({
            src,
            type: "application/dash+xml",
            streamingFormats: nativeControlsForTouch ? [] : ["DASH"],
          });
        }
        this.player.src(listSrc, tracks || []);
        this.player.addEventListener(
          window.amp.eventName.loadeddata,
          this.props.onReady
        );
      }
    });
  }

  play() {
    this.callPlayer("play");
  }

  pause() {
    this.callPlayer("pause");
  }

  stop() {
    this.callPlayer("unload");
  }

  seekTo(seconds) {
    this.callPlayer("currentTime", seconds);
  }

  setVolume(fraction) {
    this.callPlayer("volume", fraction);
  }

  setLoop(loop) {
    this.callPlayer("setLoop", loop);
  }

  setPlaybackRate(rate) {
    this.callPlayer("playbackRate", rate);
  }

  mute = () => {
    this.callPlayer("muted", true);
  };

  unmute = () => {
    this.callPlayer("muted", false);
  };

  getDuration() {
    return this.callPlayer("duration");
  }

  getCurrentTime() {
    if (!this.player) return null;
    return this.player.currentTime();
  }

  getSecondsLoaded() {
    if (!this.player) return null;
    const buffered = this.player.buffered();
    if (buffered.length === 0) {
      return 0;
    }
    const end = buffered.end(buffered.length - 1);
    const duration = this.getDuration();
    if (end > duration) {
      return duration;
    }
    return end;
  }

  ref = (player) => {
    if (this.player) {
      // Store previous player to be used by removeListeners()
      this.prevPlayer = this.player;
    }
    this.player = player;
  };

  render() {
    const { display, playsinline } = this.props;
    const style = {
      width: "100%",
      height: "100%",
      overflow: "hidden",
      display,
    };
    return (
      <div key={this.props.url} style={style}>
        <video
          ref={this.video}
          style={style}
          className={`azuremediaplayer ${SKIN}-skin amp-big-play-centered`}
          tabIndex='0'
          playsInline={playsinline}
        />
      </div>
    );
  }
}
