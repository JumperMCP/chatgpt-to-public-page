"""Generate LinkedIn article images (1920x1080) on a ComfyUI server, cycling models.

Usage: python3 generate.py [slug ...]   (no slugs = every job in both batches)
"""

import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://100.118.213.93:8080/comfyui"
OUT = Path(__file__).parent / "images"
W, H = 1920, 1088  # latent sizes must be multiples of 16; cropped to 1080 before saving

MASTER = (
    "A luminous, cinematic editorial illustration of a conversation becoming a place on the internet. "
    "On the left, a single softly glowing chat speech bubble floats in calm deep-indigo twilight. From it, "
    "ribbons of warm light and faint lines of code unfurl like folding paper, assembling mid-air into a "
    "crisp, bright, beautifully designed web page that stands upright like an open doorway on the right. "
    "Through that doorway lies a sunlit horizon: many small luminous web pages drift upward like lanterns "
    "above a vast, quiet planetary network of fine glowing threads and edge nodes, a personal corner of the "
    "internet that belongs to its maker. No cursor, no buttons, no keyboard, no hands: the page appears as if "
    "spoken into being. Warm amber and sunset orange light meeting deep blue night, volumetric glow, gentle "
    "depth of field, refined premium tech-magazine cover aesthetic, wide 16:9 composition with calm empty "
    "negative space in the upper third."
)
# Flux.1 drops most of the long master prompt; it gets this condensed version instead.
SHORT = (
    "Cinematic editorial illustration: a softly glowing chat speech bubble on the left releases ribbons of warm "
    "light that fold like paper into a bright web page standing like an open doorway on the right. Beyond it, "
    "small luminous web pages drift like lanterns over a glowing planetary network at dusk. Amber and sunset "
    "orange against deep indigo, volumetric light, premium tech-magazine cover, wide composition."
)
NO_TEXT = " Absolutely no text, no letters, no words, no logos, no watermark."

# Batch 1, door metaphor: (slug, setup, accent)
BATCH1 = [
    ("01-doorway", "qwen21",
     "Emphasis on the open doorway: the web page is a tall glowing portal, warm light spilling onto a reflective dark floor."),
    ("02-bridge", "krea2",
     "The unfurling ribbons form an elegant suspension bridge of light from the chat bubble to the web page."),
    ("03-lanterns", "klein9b",
     "Hundreds of small paper-lantern web pages rise into a vast twilight sky, each one a different personal site."),
    ("04-origami", "flux1",
     "Close, tactile view: the chat bubble is made of folded white paper, unfolding origami-style into a layered web page, soft studio light."),
    ("05-lighthouse", "flux2dev",
     "The finished web page shines like a lighthouse beacon on a quiet coastline at dusk, its beam reaching across a sea of glowing network threads."),
    ("06-constellation", "qwen21",
     "Seen from above the clouds: the planetary network is a constellation map, the new page is the brightest new star just lit."),
    ("07-seeds", "krea2+grain",
     "Words from the chat bubble fall like glowing seeds and sprout into small web pages growing on a softly lit landscape; analog film grain."),
    ("08-sunrise", "klein9b",
     "A calm sunrise over the curved horizon of the earth's edge network, the web page doorway silhouetted against the dawn."),
    ("09-isometric", "flux1+dreamscape",
     "Minimalist isometric diorama: a floating island holding a chat bubble on one side and a bright little web page on the other, connected by a path of light."),
    ("10-retro", "krea2+technicolor",
     "Retro-futurist 1950s travel poster interpretation, bold flat shapes, saturated amber and teal, optimistic space-age mood."),
]

# Batch 2: sowing and other "opening up" metaphors. Everything flows left to right, outward.
FLOW = (
    " Clear direction of motion: everything moves from left to right, outward and away, toward the far horizon."
    " The chat bubbles are blank, smooth, rounded speech-bubble shapes with nothing written on them."
    " Warm amber and soft sunrise orange light against deep blue, volumetric glow, refined premium"
    " tech-magazine cover aesthetic, wide 16:9 composition with calm empty sky in the upper third."
)
SOWER = (
    "A luminous, cinematic editorial illustration of spring sowing. On the left, a calm farmer in simple linen"
    " work clothes strides from left to right across a wide field at dawn, a canvas seed bag slung at the hip,"
    " casting a generous sweeping arc of small glowing chat speech bubbles from an outstretched hand, like seeds."
    " The bubbles fly forward to the right and land in long curving furrows. The field itself is a dreamy,"
    " glowing internetwork: furrows made of fine luminous threads and softly pulsing nodes stretching to the"
    " horizon. Where earlier bubbles landed, tiny bright web pages sprout like seedlings and grow taller toward"
    " the right, the nearest just sprouting, the farthest already in full bloom."
)
BATCH2 = [
    ("11-sower", "qwen21", SOWER + FLOW),
    ("12-sower", "krea2", SOWER + " Soft morning mist hangs low over the field." + FLOW),
    ("13-sower", "flux2dev", SOWER + " Low golden sun just above the horizon behind the field, long soft shadows." + FLOW),
    ("14-sower", "klein9b", SOWER + " Seen from a low angle at the edge of the furrows, the farmer silhouetted against the dawn sky." + FLOW),
    ("15-sower", "flux1",
     "Impressionist oil painting in the style of Van Gogh's The Sower: a farmer striding left to right at dawn,"
     " scattering small glowing blank chat speech bubbles like seeds into furrows of a luminous network field,"
     " where tiny bright web pages sprout. Huge low sun, thick brushstrokes, amber and deep blue."),
    ("16-floodgate", "qwen21",
     "A luminous, cinematic editorial illustration of something opening up. On the left, a small stone sluice gate"
     " in a quiet dam is lifting; through the opening a bright stream of glowing chat speech bubbles pours out and"
     " flows to the right down a gentle valley, branching like a river delta into a vast, dreamy, glowing"
     " internetwork of luminous threads and nodes, where small bright web pages rise like lit houses along its banks."
     + FLOW),
    ("17-paper-boats", "krea2+grain",
     "A luminous, cinematic editorial illustration of a canal lock opening at dawn. On the left the wooden lock gates"
     " swing wide open and a fleet of small folded-paper boats, each carrying a glowing chat speech bubble as its sail,"
     " sails out to the right onto a calm, glowing sea whose surface is a fine luminous network of threads and nodes;"
     " far out, the boats arrive and become small bright floating web pages. Analog film grain." + FLOW),
    ("18-blossom", "klein9b",
     "A luminous, cinematic editorial illustration of a spring bud bursting open. On the left a large glowing flower"
     " bud opens; its petals unfold and its pollen drifts to the right as a stream of tiny glowing chat speech bubbles"
     " carried on a warm breeze, settling over a dreamy glowing internetwork meadow where each one opens into a small"
     " bright web page blossom." + FLOW),
    ("19-thaw", "flux2dev",
     "A luminous, cinematic editorial illustration of a spring thaw. On the left, a sheet of blue ice over a mountain"
     " stream cracks open and melts; freed meltwater carrying glowing chat speech bubbles rushes to the right down"
     " the slope, spreading into a warm, glowing internetwork plain of luminous threads and nodes, where small bright"
     " web pages bloom along its course." + FLOW),
    ("20-dandelion", "krea2",
     "A luminous, cinematic editorial illustration of a dandelion seed head on the left, its seeds released by a warm"
     " spring breeze: each seed is a tiny glowing chat speech bubble on a fine silken parachute, drifting to the right"
     " over a dreamy, glowing internetwork landscape of luminous threads and nodes, where the landed seeds have"
     " sprouted into small bright web pages." + FLOW),
]

JOBS = [(slug, setup, (SHORT if setup.startswith("flux1") else MASTER) + " " + accent) for slug, setup, accent in BATCH1] + BATCH2


def node(cls, **inputs):
    return {"class_type": cls, "inputs": inputs}


def graph(setup, prompt, seed, prefix):
    g = {}
    if setup.startswith("flux1"):
        g["ckpt"] = node("CheckpointLoaderSimple", ckpt_name="flux1-dev-fp8.safetensors")
        model = ["ckpt", 0]
        if setup.endswith("dreamscape"):
            g["lora"] = node("LoraLoaderModelOnly", model=model, lora_name="flux_dreamscape.safetensors", strength_model=0.7)
            model = ["lora", 0]
        g["pos"] = node("CLIPTextEncode", clip=["ckpt", 1], text=prompt)
        g["guid"] = node("FluxGuidance", conditioning=["pos", 0], guidance=3.5)
        g["neg"] = node("ConditioningZeroOut", conditioning=["pos", 0])
        g["lat"] = node("EmptySD3LatentImage", width=W, height=H, batch_size=1)
        g["ks"] = node("KSampler", model=model, positive=["guid", 0], negative=["neg", 0], latent_image=["lat", 0],
                       seed=seed, steps=24, cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0)
        g["dec"] = node("VAEDecode", samples=["ks", 0], vae=["ckpt", 2])
    elif setup.startswith("krea2"):
        g["unet"] = node("UNETLoader", unet_name="krea2_turbo_fp8_scaled.safetensors", weight_dtype="default")
        model = ["unet", 0]
        lora = {"grain": "grainscape_krea2.safetensors", "technicolor": "30sTechnocolorKrea2Raw.safetensors"}
        if "+" in setup:
            g["lora"] = node("LoraLoaderModelOnly", model=model, lora_name=lora[setup.split("+")[1]], strength_model=0.8)
            model = ["lora", 0]
        g["clip"] = node("CLIPLoader", clip_name="qwen3vl_4b_bf16.safetensors", type="krea2", device="default")
        g["vae"] = node("VAELoader", vae_name="qwen_image_vae.safetensors")
        g["pos"] = node("CLIPTextEncode", clip=["clip", 0], text=prompt)
        g["neg"] = node("ConditioningZeroOut", conditioning=["pos", 0])
        g["lat"] = node("EmptyLatentImage", width=W, height=H, batch_size=1)
        g["ks"] = node("KSampler", model=model, positive=["pos", 0], negative=["neg", 0], latent_image=["lat", 0],
                       seed=seed, steps=8, cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0)
        g["dec"] = node("VAEDecode", samples=["ks", 0], vae=["vae", 0])
    elif setup == "qwen21":
        g["unet"] = node("UNETLoader", unet_name="qwen_image_2.1_int8_convrot.safetensors", weight_dtype="default")
        g["cache"] = node("QwenImage21Cache", model=["unet", 0], device="auto", dtype="default")
        g["clip"] = node("CLIPLoader", clip_name="qwen3vl_8b_int8_convrot.safetensors", type="qwen_image", device="default")
        g["vae"] = node("VAELoader", vae_name="qwen_image_2.1_vae_bf16.safetensors")
        g["enc"] = node("TextEncodeQwenImage21", clip=["clip", 0], prompt=prompt,
                        negative_prompt="text, letters, words, logo, watermark, blurry, low quality", resolution=1024)
        g["lat"] = node("EmptyLatentImage", width=W, height=H, batch_size=1)
        g["ks"] = node("KSampler", model=["cache", 0], positive=["enc", 0], negative=["enc", 1], latent_image=["lat", 0],
                       seed=seed, steps=25, cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0)
        g["dec"] = node("VAEDecode", samples=["ks", 0], vae=["vae", 0])
    else:  # Flux.2 family
        dev = setup == "flux2dev"
        g["unet"] = node("UNETLoader", unet_name="flux2_dev_fp8mixed.safetensors" if dev else "flux-2-klein-9b-fp8.safetensors",
                         weight_dtype="default")
        g["clip"] = node("CLIPLoader", clip_name="mistral_3_small_flux2_fp4_mixed.safetensors" if dev else "qwen_3_8b_fp8mixed.safetensors",
                         type="flux2", device="default")
        g["vae"] = node("VAELoader", vae_name="flux2-vae.safetensors")
        g["pos"] = node("CLIPTextEncode", clip=["clip", 0], text=prompt)
        if dev:
            g["guid"] = node("FluxGuidance", conditioning=["pos", 0], guidance=4.0)
            g["guider"] = node("BasicGuider", model=["unet", 0], conditioning=["guid", 0])
            steps = 24
        else:  # distilled Klein: 4 steps, cfg 1
            g["neg"] = node("CLIPTextEncode", clip=["clip", 0], text="")
            g["guider"] = node("CFGGuider", model=["unet", 0], positive=["pos", 0], negative=["neg", 0], cfg=1.0)
            steps = 4
        g["noise"] = node("RandomNoise", noise_seed=seed)
        g["sampler"] = node("KSamplerSelect", sampler_name="euler")
        g["sched"] = node("Flux2Scheduler", steps=steps, width=W, height=H)
        g["lat"] = node("EmptyFlux2LatentImage", width=W, height=H, batch_size=1)
        g["sca"] = node("SamplerCustomAdvanced", noise=["noise", 0], guider=["guider", 0], sampler=["sampler", 0],
                        sigmas=["sched", 0], latent_image=["lat", 0])
        g["dec"] = node("VAEDecode", samples=["sca", 0], vae=["vae", 0])
    g["crop"] = node("ImageCrop", image=["dec", 0], width=1920, height=1080, x=0, y=(H - 1080) // 2)
    g["save"] = node("SaveImage", images=["crop", 0], filename_prefix=prefix)
    return g


def api(path, data=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def run(slug, setup, prompt):
    seed = random.randint(1, 2**48)
    prompt += NO_TEXT
    prefix = f"linkedin/{slug}-{setup.replace('+', '-')}"
    pid = json.loads(api("/prompt", {"prompt": graph(setup, prompt, seed, prefix)}))["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(5)
        h = json.loads(api(f"/history/{pid}"))
        if pid in h:
            break
    status = h[pid]["status"]
    if status.get("status_str") != "success":
        print(f"{slug}: FAILED {json.dumps(status.get('messages'))[:800]}", flush=True)
        return
    img = h[pid]["outputs"]["save"]["images"][0]
    q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]})
    out = OUT / f"{slug}-{setup.replace('+', '-')}.png"
    out.write_bytes(api(f"/view?{q}"))
    print(f"{slug}: {setup} seed={seed} {time.time() - t0:.0f}s -> {out.name}", flush=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    only = set(sys.argv[1:])
    for job in JOBS:
        if not only or job[0] in only:
            run(*job)
