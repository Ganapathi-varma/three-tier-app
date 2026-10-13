FROM nginx:1.27-alpine

# Static site files.
COPY index.html app.js styles.css /usr/share/nginx/html/

# nginx config template — rendered at startup with the real backend URL.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# BACKEND_URL is substituted into the nginx template by the official
# nginx image's built-in envsubst entrypoint (/etc/nginx/templates/*.template).
ENV BACKEND_URL=http://backend:3000

EXPOSE 80

# Default nginx entrypoint handles template rendering, then runs nginx.
