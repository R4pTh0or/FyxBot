from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "dashboard" / "public" / "brand"
PUBLIC = ROOT / "dashboard" / "public"
OUTPUT = ROOT / "marketing-assets" / "operation-serveur-pret"
CAROUSEL = OUTPUT / "carousel"
APP_DIRECTORY = OUTPUT / "app-directory"

WIDTH = 1080
HEIGHT = 1920
BG = np.array([13.0, 9.0, 8.0])
ORANGE = np.array([255.0, 90.0, 42.0])
DEEP_RED = np.array([232.0, 50.0, 32.0])
WHITE = "#FFF7F3"
MUTED = "#D8BFB7"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_SEMIBOLD = Path(r"C:\Windows\Fonts\seguisb.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")


SLIDES = [
    {
        "file": "01-serveur-pret.png",
        "eyebrow": "OPÉRATION SERVEUR PRÊT",
        "title": "TON SERVEUR.\nPRÊT À ÉVOLUER.",
        "subtitle": "Décris ton projet. FyxBot prépare une base claire et adaptée.",
        "pills": ["Description libre", "Aperçu avant application"],
        "mascot": True,
    },
    {
        "file": "02-structure-adaptee.png",
        "eyebrow": "CONFIGURATION ADAPTATIVE",
        "title": "UNE STRUCTURE\nQUI TE RESSEMBLE.",
        "subtitle": "Rôles, catégories, salons et permissions proposés selon ta communauté.",
        "pills": ["Rôles cohérents", "Salons avec nom illustré", "Permissions guidées"],
    },
    {
        "file": "03-securite-communaute.png",
        "eyebrow": "TOUT AU MÊME ENDROIT",
        "title": "SÉCURISE.\nASSISTE. ANIME.",
        "subtitle": "FyxBot réunit les outils essentiels sans compliquer ton quotidien.",
        "pills": ["Modération", "Tickets", "Règlement", "Événements"],
    },
    {
        "file": "04-control-center.png",
        "eyebrow": "CONTROL CENTER FYXBOT",
        "title": "UN SEUL PANEL.\nPLUSIEURS SERVEURS.",
        "subtitle": "Configure, vérifie et suis tes communautés depuis une interface claire.",
        "pills": ["Connexion Discord", "Parcours en 7 étapes", "Support intégré"],
    },
    {
        "file": "05-offre-fondateur.png",
        "eyebrow": "OFFRE DE LANCEMENT",
        "title": "30 JOURS\nPREMIUM OFFERTS.",
        "subtitle": "Pour les 100 premiers utilisateurs Discord.",
        "pills": ["Sans carte", "Sans abonnement", "Sans renouvellement"],
        "cta": "DÉCOUVRIR FYXBOT",
        "mascot": True,
    },
]


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def background(index: int) -> Image.Image:
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]
    center_x = WIDTH * (0.76 if index % 2 == 0 else 0.18)
    center_y = HEIGHT * (0.22 + index * 0.11)
    distance = ((xx - center_x) / 680) ** 2 + ((yy - center_y) / 860) ** 2
    glow = np.exp(-distance * 3.2)[..., None]
    red_glow = np.exp(-(((xx - WIDTH * 0.15) / 620) ** 2 + ((yy - HEIGHT * 0.88) / 520) ** 2) * 4.0)[..., None]
    noise = ((np.sin(xx / 34.0) + np.cos(yy / 57.0)) * 1.2)[..., None]
    canvas = BG + glow * ORANGE * 0.31 + red_glow * DEEP_RED * 0.16 + noise
    return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def rounded_asset(image: Image.Image, size: tuple[int, int], radius: int, opacity: int = 255) -> Image.Image:
    asset = ImageEnhance.Contrast(image.convert("RGB")).enhance(1.05).resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=opacity)
    asset.putalpha(mask)
    return asset


def wrap(draw: ImageDraw.ImageDraw, text: str, selected_font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=selected_font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def add_glow(canvas: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int], blur: int = 45) -> None:
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(box, radius=60, fill=(*color, 90))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(blur)))


def create_slide(index: int, data: dict[str, object], logo: Image.Image, mascot: Image.Image) -> Path:
    canvas = background(index)
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle((58, 54, WIDTH - 58, 66), radius=6, fill="#FF5A2A")
    canvas.alpha_composite(logo.resize((112, 112), Image.Resampling.LANCZOS), (66, 98))
    draw.text((200, 112), "FYXBOT", font=font(FONT_BOLD, 42), fill=WHITE)
    draw.text((200, 164), "BOT DISCORD FRANCOPHONE", font=font(FONT_SEMIBOLD, 19), fill="#FF9C68")

    if data.get("mascot"):
        add_glow(canvas, (560, 280, 1050, 990), (255, 90, 42), 70)
        mascot_asset = rounded_asset(mascot, (470, 470), 54, 238)
        canvas.alpha_composite(mascot_asset, (555, 300))

    text_y = 830 if data.get("mascot") else 470
    draw.text((68, text_y), str(data["eyebrow"]), font=font(FONT_BOLD, 24), fill="#FF8A1F")
    text_y += 58
    title_font = font(FONT_BOLD, 96 if index != 4 else 92)
    for line in str(data["title"]).split("\n"):
        draw.text((64, text_y), line, font=title_font, fill=WHITE, stroke_width=1, stroke_fill="#FFF7F3")
        text_y += 116

    subtitle_font = font(FONT_REGULAR, 39)
    text_y += 34
    for line in wrap(draw, str(data["subtitle"]), subtitle_font, 925):
        draw.text((68, text_y), line, font=subtitle_font, fill=MUTED)
        text_y += 56

    text_y += 48
    pill_font = font(FONT_SEMIBOLD, 28)
    for label in data["pills"]:
        pill_width = min(draw.textbbox((0, 0), str(label), font=pill_font)[2] + 72, 930)
        draw.rounded_rectangle((68, text_y, 68 + pill_width, text_y + 64), radius=32, fill="#251512", outline="#A84A2C", width=2)
        draw.text((104, text_y + 14), str(label), font=pill_font, fill=WHITE)
        text_y += 82

    if data.get("cta"):
        cta_y = min(text_y + 34, HEIGHT - 230)
        draw.rounded_rectangle((68, cta_y, WIDTH - 68, cta_y + 94), radius=24, fill="#FF5A2A")
        cta_font = font(FONT_BOLD, 31)
        label = str(data["cta"])
        bbox = draw.textbbox((0, 0), label, font=cta_font)
        draw.text(((WIDTH - (bbox[2] - bbox[0])) / 2, cta_y + 26), label, font=cta_font, fill=WHITE)

    draw.text((68, HEIGHT - 112), "fyxbot-panel-production.up.railway.app", font=font(FONT_SEMIBOLD, 25), fill="#FFB28C")
    draw.ellipse((WIDTH - 116, HEIGHT - 122, WIDTH - 70, HEIGHT - 76), fill="#FF5A2A")

    CAROUSEL.mkdir(parents=True, exist_ok=True)
    target = CAROUSEL / str(data["file"])
    canvas.convert("RGB").save(target, quality=95, optimize=True)
    return target


def landscape_background(index: int) -> Image.Image:
    width, height = 1920, 1080
    yy, xx = np.mgrid[0:height, 0:width]
    center_x = width * (0.82 if index % 2 == 0 else 0.68)
    center_y = height * (0.28 + index * 0.08)
    distance = ((xx - center_x) / 820) ** 2 + ((yy - center_y) / 620) ** 2
    glow = np.exp(-distance * 3.0)[..., None]
    lower = np.exp(-(((xx - width * 0.15) / 900) ** 2 + ((yy - height * 0.92) / 460) ** 2) * 4.0)[..., None]
    canvas = BG + glow * ORANGE * 0.30 + lower * DEEP_RED * 0.14
    return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def create_directory_card(index: int, data: dict[str, object], logo: Image.Image, mascot: Image.Image) -> Path:
    width, height = 1920, 1080
    canvas = landscape_background(index)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((80, 58, width - 80, 70), radius=6, fill="#FF5A2A")
    canvas.alpha_composite(logo.resize((96, 96), Image.Resampling.LANCZOS), (92, 100))
    draw.text((218, 112), "FYXBOT", font=font(FONT_BOLD, 44), fill=WHITE)
    draw.text((218, 163), "BOT DISCORD FRANCOPHONE", font=font(FONT_SEMIBOLD, 19), fill="#FF9C68")

    add_glow(canvas, (1250, 205, 1780, 810), (255, 90, 42), 72)
    mascot_asset = rounded_asset(mascot, (520, 520), 58, 238)
    canvas.alpha_composite(mascot_asset, (1260, 225))

    draw.text((92, 330), str(data["eyebrow"]), font=font(FONT_BOLD, 25), fill="#FF8A1F")
    title_y = 384
    title_font = font(FONT_BOLD, 72)
    for line in str(data["title"]).split("\n"):
        draw.text((88, title_y), line, font=title_font, fill=WHITE)
        title_y += 86

    subtitle_font = font(FONT_REGULAR, 32)
    title_y += 18
    for line in wrap(draw, str(data["subtitle"]), subtitle_font, 1040):
        draw.text((92, title_y), line, font=subtitle_font, fill=MUTED)
        title_y += 46

    pill_x = 92
    pill_y = min(title_y + 36, 826)
    pill_font = font(FONT_SEMIBOLD, 23)
    for label in data["pills"]:
        pill_width = draw.textbbox((0, 0), str(label), font=pill_font)[2] + 58
        if pill_x + pill_width > 1170:
            pill_x = 92
            pill_y += 70
        draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_width, pill_y + 54), radius=27, fill="#251512", outline="#A84A2C", width=2)
        draw.text((pill_x + 29, pill_y + 12), str(label), font=pill_font, fill=WHITE)
        pill_x += pill_width + 18

    draw.text((92, height - 82), "fyxbot-panel-production.up.railway.app", font=font(FONT_SEMIBOLD, 24), fill="#FFB28C")
    APP_DIRECTORY.mkdir(parents=True, exist_ok=True)
    target = APP_DIRECTORY / str(data["file"])
    canvas.convert("RGB").save(target, quality=95, optimize=True)
    return target


def create_video(ffmpeg: Path, slides: list[Path]) -> Path:
    target = OUTPUT / "fyxbot-operation-serveur-pret-vertical.mp4"
    command = [str(ffmpeg), "-y"]
    for slide in slides:
        command += ["-loop", "1", "-t", "3", "-i", str(slide)]
    filters = []
    for index in range(len(slides)):
        filters.append(
            f"[{index}:v]scale={WIDTH}:{HEIGHT},fps=30,"
            "fade=t=in:st=0:d=0.35,fade=t=out:st=2.65:d=0.35,"
            f"setpts=PTS-STARTPTS[v{index}]"
        )
    filters.append(
        "".join(f"[v{index}]" for index in range(len(slides)))
        + f"concat=n={len(slides)}:v=1:a=0,fps=30,settb=1/30,setpts=N,format=yuv420p[v]"
    )
    command += [
        "-filter_complex", ";".join(filters),
        "-map", "[v]",
        "-r", "30",
        "-c:v", "libx264",
        "-level:v", "4.2",
        "-preset", "medium",
        "-crf", "20",
        "-video_track_timescale", "90000",
        "-movflags", "+faststart",
        str(target),
    ]
    subprocess.run(command, check=True)
    return target


def main() -> int:
    logo = Image.open(BRAND / "fyxbot-logo-symbol-transparent.png").convert("RGBA")
    mascot = Image.open(PUBLIC / "mascotte-fyxbot-640.webp").convert("RGBA")
    slides = [create_slide(index, data, logo, mascot) for index, data in enumerate(SLIDES)]
    directory_cards = [create_directory_card(index, data, logo, mascot) for index, data in enumerate(SLIDES)]
    print(f"Carrousel créé : {len(slides)} visuels dans {CAROUSEL}")
    print(f"Médias App Directory créés : {len(directory_cards)} visuels dans {APP_DIRECTORY}")

    ffmpeg_argument = next((argument.split("=", 1)[1] for argument in sys.argv[1:] if argument.startswith("--ffmpeg=")), None)
    if ffmpeg_argument:
        video = create_video(Path(ffmpeg_argument), slides)
        print(f"Vidéo créée : {video}")
    else:
        print("Vidéo non créée : fournissez --ffmpeg=<chemin> après installation de l’encodeur temporaire.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
