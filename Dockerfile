# =============================================================================
# GEREO — frontend estático (nginx). Imagen para ECS Fargate (linux/amd64).
# =============================================================================
# El frontend es HTML/CSS/JS puro: no hay build ni bundler, así que la imagen es
# nginx + los archivos tal cual están en el repo.
#
# Va detrás del MISMO balanceador que el backend (gereo.global66.com), no en un
# dominio aparte. Por eso `js/comun/nucleo.js` resuelve la API contra el mismo
# origen (solo lee config.json cuando el host termina en .github.io) y CORS
# directamente no existe: el navegador nunca ve dos orígenes.
FROM nginx:1.27-alpine

# Nginx corre como root solo para leer la config y luego baja a `nginx`; acá se
# fija el UID/GID 10001 explícito para que el proceso que atiende peticiones no
# sea un usuario heredado de la imagen base. El puerto es 8080 y no 80 porque
# un usuario sin privilegios no puede escuchar por debajo de 1024.
#
# Se hace chown de /var/cache/nginx -directorios de trabajo de nginx- pero NO de
# /var/run: ese es un symlink a /run, que el runtime monta como un tmpfs NUEVO
# propiedad de root en cada arranque, asi que el chown del build no sobrevive.
# Por eso el pid vive en /tmp (ver nginx.conf).
RUN deluser nginx 2>/dev/null; \
    addgroup -g 10001 gereo && \
    adduser -D -H -u 10001 -G gereo -s /sbin/nologin gereo && \
    mkdir -p /var/cache/nginx && \
    chown -R 10001:10001 /var/cache/nginx /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf

# Solo los activos que sirve la página. Nada de README, ni .git, ni config.json:
# ese archivo es exclusivo del despliegue en GitHub Pages (lleva la URL del
# túnel del PC) y aquí, con el backend en el mismo origen, sobra — peor,
# apuntaría a un túnel muerto si alguien lo copiara sin pensar.
COPY index.html /usr/share/nginx/html/
COPY css/    /usr/share/nginx/html/css/
COPY js/     /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/salud-frontend || exit 1

CMD ["nginx", "-g", "daemon off;"]
