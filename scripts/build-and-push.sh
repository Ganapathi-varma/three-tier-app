#!/usr/bin/env bash
#
# Build, tag, and push the three service images (backend, frontend, database)
# to a container registry, then render the Kubernetes manifests with the real
# image references.
#
# USAGE:
#   REGISTRY=docker.io/<your-username> TAG=1.0.0 ./scripts/build-and-push.sh
#   REGISTRY=ghcr.io/<your-user>       TAG=1.0.0 ./scripts/build-and-push.sh
#   REGISTRY=<acct>.dkr.ecr.<region>.amazonaws.com TAG=1.0.0 ECR=1 AWS_REGION=<region> ./scripts/build-and-push.sh
#
# ENVIRONMENT VARIABLES:
#   REGISTRY   (required) Registry prefix, e.g. docker.io/alice or
#              123456789012.dkr.ecr.eu-west-1.amazonaws.com
#   TAG        (optional) Image tag. Default: a timestamp-based version.
#   ECR        (optional) Set to 1 to enable Amazon ECR login + repo creation.
#   AWS_REGION (required when ECR=1) AWS region for ECR.
#   PUSH       (optional) Set to 0 to build+render only, skipping the push.
#
# After it runs, deploy with:
#   kubectl apply -f k8s/00-namespace.yaml
#   kubectl apply -f k8s/01-secrets.yaml
#   kubectl apply -f k8s-rendered/

set -euo pipefail

# --- Resolve paths relative to this script, not the caller's CWD. ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
K8S_SRC="$PROJECT_DIR/k8s"
K8S_OUT="$PROJECT_DIR/k8s-rendered"

# --- Validate inputs -------------------------------------------------------
: "${REGISTRY:?Set REGISTRY, e.g. REGISTRY=docker.io/<username>}"
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"
PUSH="${PUSH:-1}"
ECR="${ECR:-0}"

IMAGES=("three-tier-backend" "three-tier-frontend" "three-tier-database")

echo "Registry : $REGISTRY"
echo "Tag      : $TAG"
echo "Push     : $PUSH"
echo "ECR mode : $ECR"
echo

# --- Optional: Amazon ECR login + repository creation ----------------------
if [[ "$ECR" == "1" ]]; then
  : "${AWS_REGION:?Set AWS_REGION when ECR=1}"
  echo ">> Logging in to Amazon ECR ($AWS_REGION) ..."
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$REGISTRY"

  for img in "${IMAGES[@]}"; do
    echo ">> Ensuring ECR repository exists: $img"
    aws ecr describe-repositories --repository-names "$img" --region "$AWS_REGION" >/dev/null 2>&1 \
      || aws ecr create-repository --repository-name "$img" --region "$AWS_REGION" >/dev/null
  done
  echo
fi

# --- Build + (optionally) push ---------------------------------------------
build_push() {
  local name="$1" context="$2"
  local ref="$REGISTRY/$name:$TAG"
  echo ">> Building $ref"
  docker build -t "$ref" "$context"
  if [[ "$PUSH" == "1" ]]; then
    echo ">> Pushing $ref"
    docker push "$ref"
  else
    echo ">> Skipping push (PUSH=0)"
  fi
  echo
}

build_push "three-tier-backend"  "$PROJECT_DIR/backend"
build_push "three-tier-frontend" "$PROJECT_DIR/frontend"
build_push "three-tier-database" "$PROJECT_DIR/database"

# --- Render manifests with the real image references -----------------------
# Replaces the __REGISTRY__ and __TAG__ placeholders in the manifests that
# reference built images (the DB StatefulSet, backend, and frontend).
echo ">> Rendering manifests into $K8S_OUT"
mkdir -p "$K8S_OUT"
for f in "$K8S_SRC"/03-db-statefulset.yaml "$K8S_SRC"/04-backend.yaml "$K8S_SRC"/05-frontend.yaml; do
  out="$K8S_OUT/$(basename "$f")"
  sed -e "s|__REGISTRY__|$REGISTRY|g" -e "s|__TAG__|$TAG|g" "$f" > "$out"
  echo "   rendered $(basename "$f")"
done

echo
echo "Done. Deploy with:"
echo "  kubectl apply -f $K8S_SRC/00-namespace.yaml"
echo "  kubectl apply -f $K8S_SRC/01-secrets.yaml"
echo "  kubectl apply -f $K8S_OUT/"
