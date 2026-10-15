from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

router = APIRouter()


@router.get("/{z}/{x}/{y}.png")
def get_map_tile(z: int, x: int, y: int) -> Response:
    """Serve map tiles through the app so LAN devices do not need direct tile-server access."""
    if not 0 <= z <= 19 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map tile not found")

    upstream = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    try:
        request = Request(upstream, headers={"User-Agent": "PhotoScout local MVP map/0.1"})
        with urlopen(request, timeout=12) as response:
            image = response.read()
            media_type = response.headers.get_content_type() or "image/png"
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Map tile service is unavailable") from exc

    return Response(content=image, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
