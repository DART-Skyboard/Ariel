// Frax Studio · JPEG XL bridge (libjxl → WebAssembly)
// Radical Deepscale LLC / DART Meadow.  libjxl is BSD-3-Clause (see LICENSE-libjxl beside the .wasm).
//
// A thin C layer over libjxl's encoder and decoder so the page can drive every encoder control:
// bit depth (8/10/12/16 integer, 16/32 float), alpha (depth, premultiplied, own distance), animation (per-frame
// durations, loops), layered frames with crop + blend (used for region-of-interest quality), all frame-setting
// options (effort, decoding speed, groups/tiles, progressive modes, EPF, gaborish, noise, palette, predictors...),
// colour encodings, container + metadata boxes, codestream level, and lossless JPEG transcoding.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <emscripten/emscripten.h>
#include "jxl/encode.h"
#include "jxl/decode.h"
#include "jxl/color_encoding.h"
#include "jxl/cms.h"

#define KEEP EMSCRIPTEN_KEEPALIVE

typedef struct {
  JxlEncoder* enc;
  uint8_t* out; size_t outCap, outLen;
  int bits, expBits, channels, hasAlpha, alphaBits, alphaExp;
  char err[160];
} Jxw;

static void seterr(Jxw* h, const char* what) {
  int e = h && h->enc ? (int)JxlEncoderGetError(h->enc) : -1;
  if (h) snprintf(h->err, sizeof h->err, "%s (libjxl error %d)", what, e);
}

KEEP const char* jxw_error(Jxw* h) { return h ? h->err : "no encoder"; }
KEEP int jxw_version(void) { return (int)JxlEncoderVersion(); }

KEEP Jxw* jxw_new(void) {
  Jxw* h = (Jxw*)calloc(1, sizeof(Jxw));
  h->enc = JxlEncoderCreate(NULL);
  if (!h->enc) { free(h); return NULL; }
  JxlEncoderSetCms(h->enc, *JxlGetDefaultCms());
  JxlEncoderAllowExpertOptions(h->enc);
  return h;
}

KEEP void jxw_free(Jxw* h) {
  if (!h) return;
  if (h->enc) JxlEncoderDestroy(h->enc);
  free(h->out); free(h);
}

// bits: 8,10,12,16 (integer) or 16/32 with expBits 5/8 (float). channels: 1 (grey) or 3 (colour).
// alphaBits 0 = no alpha.  animated: 1 with tps num/den and loops (0 = forever).
// usesOriginalProfile: 1 for lossless (keep exact samples), 0 lets the encoder work in XYB.
KEEP int jxw_basic(Jxw* h, int w, int hgt, int bits, int expBits, int channels, int alphaBits, int alphaExp,
                   int alphaPremul, int animated, int tpsNum, int tpsDen, int loops, int usesOriginalProfile,
                   float intensityTarget, int orientation) {
  JxlBasicInfo bi; JxlEncoderInitBasicInfo(&bi);
  bi.xsize = (uint32_t)w; bi.ysize = (uint32_t)hgt;
  bi.bits_per_sample = (uint32_t)bits; bi.exponent_bits_per_sample = (uint32_t)expBits;
  bi.num_color_channels = (uint32_t)channels;
  bi.uses_original_profile = usesOriginalProfile ? JXL_TRUE : JXL_FALSE;
  if (intensityTarget > 0) bi.intensity_target = intensityTarget;
  if (orientation >= 1 && orientation <= 8) bi.orientation = (JxlOrientation)orientation;
  if (alphaBits > 0) {
    bi.num_extra_channels = 1; bi.alpha_bits = (uint32_t)alphaBits; bi.alpha_exponent_bits = (uint32_t)alphaExp;
    bi.alpha_premultiplied = alphaPremul ? JXL_TRUE : JXL_FALSE;
  }
  if (animated) {
    bi.have_animation = JXL_TRUE;
    bi.animation.tps_numerator = (uint32_t)tpsNum; bi.animation.tps_denominator = (uint32_t)tpsDen;
    bi.animation.num_loops = (uint32_t)loops;
  }
  h->bits = bits; h->expBits = expBits; h->channels = channels; h->hasAlpha = alphaBits > 0;
  h->alphaBits = alphaBits; h->alphaExp = alphaExp;
  if (JxlEncoderSetBasicInfo(h->enc, &bi) != JXL_ENC_SUCCESS) { seterr(h, "basic info rejected"); return 0; }
  if (alphaBits > 0) {
    JxlExtraChannelInfo ec; JxlEncoderInitExtraChannelInfo(JXL_CHANNEL_ALPHA, &ec);
    ec.bits_per_sample = (uint32_t)alphaBits; ec.exponent_bits_per_sample = (uint32_t)alphaExp;
    ec.alpha_premultiplied = alphaPremul ? JXL_TRUE : JXL_FALSE;
    if (JxlEncoderSetExtraChannelInfo(h->enc, 0, &ec) != JXL_ENC_SUCCESS) { seterr(h, "alpha channel rejected"); return 0; }
  }
  return 1;
}

// preset: 0 sRGB · 1 linear sRGB · 2 Display P3 · 3 Rec.2100 PQ (HDR) · 4 Rec.2100 HLG (HDR) · 5 Rec.2020 (SDR)
// grey images use the same transfer with a grey colour space.  intent: 0 perceptual 1 relative 2 saturation 3 absolute
KEEP int jxw_color(Jxw* h, int preset, int intent) {
  JxlColorEncoding c; memset(&c, 0, sizeof c);
  int grey = h->channels == 1;
  JxlColorEncodingSetToSRGB(&c, grey ? JXL_TRUE : JXL_FALSE);
  switch (preset) {
    case 1: c.transfer_function = JXL_TRANSFER_FUNCTION_LINEAR; break;
    case 2: c.primaries = JXL_PRIMARIES_P3; break;
    case 3: c.primaries = JXL_PRIMARIES_2100; c.transfer_function = JXL_TRANSFER_FUNCTION_PQ; break;
    case 4: c.primaries = JXL_PRIMARIES_2100; c.transfer_function = JXL_TRANSFER_FUNCTION_HLG; break;
    case 5: c.primaries = JXL_PRIMARIES_2100; c.transfer_function = JXL_TRANSFER_FUNCTION_709; break;
    default: break;
  }
  c.rendering_intent = (JxlRenderingIntent)intent;
  if (JxlEncoderSetColorEncoding(h->enc, &c) != JXL_ENC_SUCCESS) { seterr(h, "colour encoding rejected"); return 0; }
  return 1;
}

KEEP int jxw_container(Jxw* h, int useContainer, int level) {
  if (useContainer >= 0 && JxlEncoderUseContainer(h->enc, useContainer ? JXL_TRUE : JXL_FALSE) != JXL_ENC_SUCCESS) { seterr(h, "container"); return 0; }
  if (level == 5 || level == 10) if (JxlEncoderSetCodestreamLevel(h->enc, level) != JXL_ENC_SUCCESS) { seterr(h, "codestream level"); return 0; }
  return 1;
}

// metadata boxes ("Exif", "xml ", "jumb" ...) — must be called before the first frame
KEEP int jxw_use_boxes(Jxw* h) { return JxlEncoderUseBoxes(h->enc) == JXL_ENC_SUCCESS; }
KEEP int jxw_add_box(Jxw* h, const char* type4, const uint8_t* data, int size, int compress) {
  JxlBoxType t; memcpy(t, type4, 4);
  if (JxlEncoderAddBox(h->enc, t, data, (size_t)size, compress ? JXL_TRUE : JXL_FALSE) != JXL_ENC_SUCCESS) { seterr(h, "metadata box"); return 0; }
  return 1;
}
KEEP void jxw_close_boxes(Jxw* h) { JxlEncoderCloseBoxes(h->enc); }

KEEP JxlEncoderFrameSettings* jxw_settings(Jxw* h) { return JxlEncoderFrameSettingsCreate(h->enc, NULL); }
KEEP int jxw_set_int(JxlEncoderFrameSettings* fs, int id, int v) { return JxlEncoderFrameSettingsSetOption(fs, (JxlEncoderFrameSettingId)id, (int64_t)v) == JXL_ENC_SUCCESS; }
KEEP int jxw_set_float(JxlEncoderFrameSettings* fs, int id, float v) { return JxlEncoderFrameSettingsSetFloatOption(fs, (JxlEncoderFrameSettingId)id, v) == JXL_ENC_SUCCESS; }
KEEP int jxw_lossless(JxlEncoderFrameSettings* fs, int on) { return JxlEncoderSetFrameLossless(fs, on ? JXL_TRUE : JXL_FALSE) == JXL_ENC_SUCCESS; }
KEEP int jxw_distance(JxlEncoderFrameSettings* fs, float d) { return JxlEncoderSetFrameDistance(fs, d) == JXL_ENC_SUCCESS; }
KEEP int jxw_alpha_distance(JxlEncoderFrameSettings* fs, float d) { return JxlEncoderSetExtraChannelDistance(fs, 0, d) == JXL_ENC_SUCCESS; }
KEEP float jxw_distance_from_quality(float q) { return JxlEncoderDistanceFromQuality(q); }

// Frame header: duration (ticks), optional crop (a layer placed at x,y of size w,h), blend mode
// (0 replace, 1 add, 2 blend/over, 3 muladd, 4 mul), blend source slot, save-as-reference slot (-1 none), name.
KEEP int jxw_frame_header(Jxw* h, JxlEncoderFrameSettings* fs, int duration, int crop, int x, int y, int w, int hgt,
                          int blendMode, int blendSource, int saveAsRef, const char* name) {
  JxlFrameHeader fh; JxlEncoderInitFrameHeader(&fh);
  fh.duration = (uint32_t)duration;
  if (crop) { fh.layer_info.have_crop = JXL_TRUE; fh.layer_info.crop_x0 = x; fh.layer_info.crop_y0 = y; fh.layer_info.xsize = (uint32_t)w; fh.layer_info.ysize = (uint32_t)hgt; }
  fh.layer_info.blend_info.blendmode = (JxlBlendMode)blendMode;
  fh.layer_info.blend_info.source = (uint32_t)blendSource;
  fh.layer_info.blend_info.alpha = 0;
  if (saveAsRef >= 0) fh.layer_info.save_as_reference = (uint32_t)saveAsRef;
  if (JxlEncoderSetFrameHeader(fs, &fh) != JXL_ENC_SUCCESS) { seterr(h, "frame header rejected"); return 0; }
  if (h->hasAlpha) {
    JxlBlendInfo bi; JxlEncoderInitBlendInfo(&bi);
    bi.blendmode = (JxlBlendMode)blendMode; bi.source = (uint32_t)blendSource; bi.alpha = 0;
    JxlEncoderSetExtraChannelBlendInfo(fs, 0, &bi);
  }
  if (name && name[0]) JxlEncoderSetFrameName(fs, name);
  return 1;
}

// dataType: 0 uint8 · 1 uint16 · 2 float32 · 3 float16.  channels in the buffer: 1 grey, 2 grey+alpha, 3 RGB, 4 RGBA
KEEP int jxw_add_frame(Jxw* h, JxlEncoderFrameSettings* fs, const void* data, int bytes, int dataType, int channels) {
  JxlPixelFormat pf = { (uint32_t)channels, JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0 };
  pf.data_type = dataType == 1 ? JXL_TYPE_UINT16 : dataType == 2 ? JXL_TYPE_FLOAT : dataType == 3 ? JXL_TYPE_FLOAT16 : JXL_TYPE_UINT8;
  // tell libjxl how many bits of the input samples are meaningful (so 8-bit data stored at 16 bits isn't misread)
  if (dataType == 0 || dataType == 1) {
    JxlBitDepth bd; bd.type = JXL_BIT_DEPTH_FROM_PIXEL_FORMAT; bd.bits_per_sample = 0; bd.exponent_bits_per_sample = 0;
    JxlEncoderSetFrameBitDepth(fs, &bd);
  }
  if (JxlEncoderAddImageFrame(fs, &pf, data, (size_t)bytes) != JXL_ENC_SUCCESS) { seterr(h, "frame rejected"); return 0; }
  return 1;
}

// Lossless JPEG → JPEG XL transcoding: the original JPEG bytes can be rebuilt bit-for-bit from the .jxl
KEEP int jxw_add_jpeg(Jxw* h, JxlEncoderFrameSettings* fs, const uint8_t* jpg, int size, int storeMetadata) {
  if (storeMetadata && JxlEncoderStoreJPEGMetadata(h->enc, JXL_TRUE) != JXL_ENC_SUCCESS) { seterr(h, "JPEG metadata"); return 0; }
  if (JxlEncoderAddJPEGFrame(fs, jpg, (size_t)size) != JXL_ENC_SUCCESS) { seterr(h, "JPEG not transcodable"); return 0; }
  return 1;
}

KEEP void jxw_close_frames(Jxw* h) { JxlEncoderCloseFrames(h->enc); }
KEEP void jxw_close_input(Jxw* h) { JxlEncoderCloseInput(h->enc); }

// Runs the encoder to completion. Returns output size, or -1 on error.
KEEP int jxw_finish(Jxw* h) {
  if (!h->out) { h->outCap = 1 << 16; h->out = (uint8_t*)malloc(h->outCap); h->outLen = 0; }
  for (;;) {
    uint8_t* next = h->out + h->outLen; size_t avail = h->outCap - h->outLen;
    JxlEncoderStatus st = JxlEncoderProcessOutput(h->enc, &next, &avail);
    h->outLen = (size_t)(next - h->out);
    if (st == JXL_ENC_SUCCESS) return (int)h->outLen;
    if (st == JXL_ENC_NEED_MORE_OUTPUT) {
      h->outCap *= 2; h->out = (uint8_t*)realloc(h->out, h->outCap);
      if (!h->out) { snprintf(h->err, sizeof h->err, "out of memory"); return -1; }
      continue;
    }
    seterr(h, "encode failed"); return -1;
  }
}
KEEP uint8_t* jxw_out(Jxw* h) { return h->out; }

// ── Decoder (import .jxl into Frax, and preview what the export will look like) ──
typedef struct {
  int w, h, frames, hasAlpha, bits, animated, tpsNum, tpsDen, loops;
  uint8_t* rgba; size_t rgbaCap;          // all frames, RGBA8 (or RGBA16 if want16), stacked
  int* durations; int durCap;
  char err[120];
} Jxd;

KEEP Jxd* jxd_decode(const uint8_t* data, int size, int want16, int maxFrames) {
  Jxd* r = (Jxd*)calloc(1, sizeof(Jxd));
  JxlDecoder* d = JxlDecoderCreate(NULL);
  if (!d) { snprintf(r->err, sizeof r->err, "no decoder"); return r; }
  JxlDecoderSubscribeEvents(d, JXL_DEC_BASIC_INFO | JXL_DEC_FRAME | JXL_DEC_FULL_IMAGE);
  JxlDecoderSetCms(d, *JxlGetDefaultCms());
  // composite layers and render to sRGB so the browser canvas shows it correctly
  JxlDecoderSetCoalescing(d, JXL_TRUE);
  JxlColorEncoding srgb; JxlColorEncodingSetToSRGB(&srgb, JXL_FALSE);
  JxlDecoderSetInput(d, data, (size_t)size); JxlDecoderCloseInput(d);
  JxlPixelFormat pf = { 4, want16 ? JXL_TYPE_UINT16 : JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0 };
  size_t frameBytes = 0; int curDur = 0; int setColor = 0;
  if (maxFrames <= 0) maxFrames = 1000000;
  for (;;) {
    JxlDecoderStatus st = JxlDecoderProcessInput(d);
    if (st == JXL_DEC_ERROR) { snprintf(r->err, sizeof r->err, "not a valid JPEG XL file"); break; }
    if (st == JXL_DEC_NEED_MORE_INPUT) { snprintf(r->err, sizeof r->err, "file is truncated"); break; }
    if (st == JXL_DEC_SUCCESS) break;
    if (st == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo bi; JxlDecoderGetBasicInfo(d, &bi);
      r->w = (int)bi.xsize; r->h = (int)bi.ysize; r->hasAlpha = bi.alpha_bits > 0; r->bits = (int)bi.bits_per_sample;
      r->animated = bi.have_animation; r->tpsNum = (int)bi.animation.tps_numerator; r->tpsDen = (int)bi.animation.tps_denominator; r->loops = (int)bi.animation.num_loops;
      if (!setColor) { JxlDecoderSetPreferredColorProfile(d, &srgb); setColor = 1; }
    } else if (st == JXL_DEC_FRAME) {
      JxlFrameHeader fh; JxlDecoderGetFrameHeader(d, &fh); curDur = (int)fh.duration;
    } else if (st == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      JxlDecoderImageOutBufferSize(d, &pf, &frameBytes);
      if (r->frames >= maxFrames) { snprintf(r->err, sizeof r->err, "frame limit"); break; }
      size_t need = frameBytes * (size_t)(r->frames + 1);
      if (need > r->rgbaCap) { r->rgbaCap = need * 2; r->rgba = (uint8_t*)realloc(r->rgba, r->rgbaCap); if (!r->rgba) { snprintf(r->err, sizeof r->err, "out of memory"); break; } }
      JxlDecoderSetImageOutBuffer(d, &pf, r->rgba + frameBytes * (size_t)r->frames, frameBytes);
    } else if (st == JXL_DEC_FULL_IMAGE) {
      if (r->frames >= r->durCap) { r->durCap = r->durCap ? r->durCap * 2 : 16; r->durations = (int*)realloc(r->durations, sizeof(int) * r->durCap); }
      r->durations[r->frames] = curDur; r->frames++;
      if (r->frames >= maxFrames) break;
    }
  }
  JxlDecoderDestroy(d);
  return r;
}
KEEP int jxd_w(Jxd* r) { return r->w; }
KEEP int jxd_h(Jxd* r) { return r->h; }
KEEP int jxd_frames(Jxd* r) { return r->frames; }
KEEP int jxd_alpha(Jxd* r) { return r->hasAlpha; }
KEEP int jxd_bits(Jxd* r) { return r->bits; }
KEEP int jxd_animated(Jxd* r) { return r->animated; }
KEEP int jxd_tps_num(Jxd* r) { return r->tpsNum; }
KEEP int jxd_tps_den(Jxd* r) { return r->tpsDen; }
KEEP int jxd_loops(Jxd* r) { return r->loops; }
KEEP uint8_t* jxd_pixels(Jxd* r) { return r->rgba; }
KEEP int jxd_duration(Jxd* r, int i) { return (r->durations && i < r->frames) ? r->durations[i] : 0; }
KEEP const char* jxd_error(Jxd* r) { return r->err; }
KEEP void jxd_free(Jxd* r) { if (!r) return; free(r->rgba); free(r->durations); free(r); }
