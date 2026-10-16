# SPDX-License-Identifier: GPL-3.0-or-later AND BSD-3-Clause
# Frax JXL — a JPEG XL encoder written in pure Python + numpy for Blender.
#
# JPEG XL is ISO/IEC 18181. This encoder writes standard JPEG XL codestreams that any conforming decoder reads.
# Its bitstream layout follows the JPEG XL reference implementation, libjxl
# (https://github.com/libjxl/libjxl, Copyright (c) the JPEG XL Project Authors, BSD-3-Clause), in particular the
# header field definitions (headers.cc, image_metadata.cc, frame_header.cc, color_encoding_internal.cc) and the
# modular lossless layout of libjxl's fast-lossless encoder (enc_fast_lossless.cc, by Luca Versari et al.).
# How JPEG XL works is unchanged: this is a re-implementation of the same format in Python, bridging it into
# Blender's render pipeline. libjxl's license text is included as LICENSE-libjxl.txt.
from .encoder import Encoder, FrameOptions, ImageOptions, encode_image  # noqa: F401
