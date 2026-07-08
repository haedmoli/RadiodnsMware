ARG CLI_IMAGE
FROM ${CLI_IMAGE} AS cli

FROM uselagoon/node-20:26.6.0

WORKDIR /app

COPY --from=cli /app /app

CMD ["node", "dist/main"]
