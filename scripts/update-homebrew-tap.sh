#!/usr/bin/env bash

set -euo pipefail

CLAWWORK_REPO="${CLAWWORK_REPO:-clawwork-ai/clawwork}"
TAP_DIR="${TAP_DIR:-homebrew-clawwork}"
RELEASE_TAG="${RELEASE_TAG:-${GITHUB_REF_NAME:-}}"

if [[ -z "${RELEASE_TAG}" ]]; then
  echo "RELEASE_TAG is required" >&2
  exit 1
fi

asset_json="$(gh release view "${RELEASE_TAG}" -R "${CLAWWORK_REPO}" --json assets --jq '.assets[] | select(.name | endswith("-mac-universal.dmg"))' | head -n 1)"

if [[ -z "${asset_json}" ]]; then
  echo "No macOS universal DMG asset found for ${RELEASE_TAG}" >&2
  exit 1
fi

asset_name="$(jq -r '.name' <<<"${asset_json}")"
asset_url="$(jq -r '.url' <<<"${asset_json}")"
asset_digest="$(jq -r '.digest // empty' <<<"${asset_json}")"
sha256="${asset_digest#sha256:}"
version="${RELEASE_TAG#v}"

if [[ -z "${sha256}" ]]; then
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "${tmp_dir}"' EXIT

  gh release download "${RELEASE_TAG}" -R "${CLAWWORK_REPO}" --pattern "${asset_name}" --dir "${tmp_dir}"
  sha256="$(shasum -a 256 "${tmp_dir}/${asset_name}" | awk '{print $1}')"
fi

mkdir -p "${TAP_DIR}/Casks"

cat > "${TAP_DIR}/Casks/clawwork.rb" <<EOF
cask "clawwork" do
  version "${version}"
  sha256 "${sha256}"

  url "${asset_url}"
  name "ClawWork"
  desc "Desktop client for OpenClaw"
  homepage "https://github.com/clawwork-ai/clawwork"

  app "ClawWork.app"

  postflight do
    system_command "xattr", args: ["-cr", "#{appdir}/ClawWork.app"]
  end
end
EOF
