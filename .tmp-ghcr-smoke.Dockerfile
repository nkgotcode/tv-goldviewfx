FROM alpine:3.20
RUN echo ghcr-smoke > /smoke.txt
CMD ["cat","/smoke.txt"]
