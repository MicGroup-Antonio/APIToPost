# Dev Container Setup

This project includes a development container configuration for VS Code.

## What's Included

- **Node.js 20** - Latest LTS version
- **Automatic npm install** - Dependencies are installed when the container is created
- **External PostgreSQL** - Connects to your existing PostgreSQL 17 container

## Getting Started

1. Make sure you have the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) installed in VS Code
2. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Select "Dev Containers: Reopen in Container"
4. Wait for the container to build and start (first time may take a few minutes)
5. The container will automatically run `npm install` when created

## Environment Variables

Create a `.env` file in the project root with:

```
CONFIG_PATH=./config/config.local.json
```

You can also set `CONFIG_PATH` in the docker-compose.yml file or override it when starting the container.

## Ports

- **9999** - API Server (forwarded automatically)

## Database

This devcontainer connects to your existing PostgreSQL 17 container (`postgres17`) running in Docker. Both containers communicate via Docker networking using the container name.

### Database Connection Settings

The connection is configured to match your DBeaver settings:
- **Host**: `postgres17` (PostgreSQL container name)
- **Port**: `5432`
- **Database**: `mic-pro-04`
- **User**: `postgres`
- **Password**: `123_Avant_123`

### Network Configuration

The devcontainer is configured to join the `db_default` network (same network as your `postgres17` container), allowing them to communicate using the container name.

**Configuration:**
- Devcontainer network: `db_default` (external network)
- PostgreSQL container: `postgres17`
- Connection: Uses container name `postgres17` as the host

### Configuration Files

The database connection is configured in:
- `.devcontainer/docker-compose.yml` - Environment variables for the container
- `config/config.local.json` - Application database configuration (already updated)

If you need to use a different PostgreSQL container name, set the `POSTGRES_CONTAINER_NAME` environment variable in your `.env` file.

## Running the Application

Once inside the container:

```bash
npm run serve
```

The server will be available at `http://localhost:9999`

## Troubleshooting

- If the container fails to start, check the Docker logs
- Make sure Docker Desktop (or Docker daemon) is running
- If ports are already in use, you may need to stop other services using those ports

