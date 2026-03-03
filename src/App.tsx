import classNames from "classnames";
import React, { useEffect } from "react";
import { BiLoader } from "react-icons/bi";
import { Link, Redirect, Route, Switch } from "react-router-dom";
import useFetch, { CachePolicies } from "use-http";
import { Map } from "./components/Map";
import { Caucasus } from "./dcs/maps/Caucasus";
import { DCSMap } from "./dcs/maps/DCSMap";
import { Marianas } from "./dcs/maps/Marianas";
import { PersianGulf } from "./dcs/maps/PersianGulf";
import { Sinai } from "./dcs/maps/Sinai";
import { Syria } from "./dcs/maps/Syria";
import { Falklands } from "./dcs/maps/Falklands";
import { Normandy } from "./dcs/maps/Normandy";
import { TheChannel } from "./dcs/maps/TheChannel";
import { Nevada } from "./dcs/maps/Nevada";
import { Kola } from "./dcs/maps/Kola";
import { Afghanistan } from "./dcs/maps/Afghanistan";
import { GermanyCW } from "./dcs/maps/GermanyCW";
import { Server, serverStore } from "./stores/ServerStore";
import { route } from "./util";

type ServerMetadata = {
  name: string;
  enabled: boolean;
  players: Array<{ name: string; type: string }>;
};

function ServerOption({ server }: { server: ServerMetadata }) {
  return (
    <Link
      to={`/servers/${server.name}`}
      className="p-2 bg-gray-100 hover:bg-gray-200 border-gray-400 border rounded-sm shadow-sm w-full items-center flex flex-row"
    >
      <span className="text-3xl font-bold flex-grow">{server.name} </span>
      <span className="text-gray-600 text-sm font-light text-right">
        ({server.players.length} online)
      </span>
    </Link>
  );
}

function ServerConnectModal() {
  const {
    loading,
    error,
    data: servers,
    get,
  } = useFetch<Array<ServerMetadata>>(
    process.env.NODE_ENV === "production"
      ? `/api/servers`
      : `http://localhost:7789/api/servers`,
    []
  );

  return (
    <div
      className={classNames(
        "flex flex-col overflow-x-hidden overflow-y-auto absolute",
        "inset-0 z-50 bg-gray-100 mx-auto my-auto max-w-3xl",
        "border border-gray-200 rounded-sm shadow-md"
      )}
      style={{ maxHeight: "50%" }}
    >
      <div className="flex flex-row items-center p-2 border-b border-gray-400">
        <div className="text-2xl">Select Server</div>
      </div>
      <div className="flex flex-row p-2 h-full">
        {loading && (
          <BiLoader className="h-6 w-6 text-blue-400 animate-spin my-auto mx-auto" />
        )}
        {error && (
          <div>
            Something went wrong accessing the backend server. Please check your
            connection and <button onClick={() => get()}>try again</button>.
          </div>
        )}
        {servers && (
          <div className="flex flex-col gap-1 w-full">
            {servers.map((it) => {if (it.enabled) {
				return <ServerOption key={it.name} server={it} />
				
            }})}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerContainer({ serverName }: { serverName: string }) {
  const backendMaintenance = serverStore((state) => state.backendMaintenance);

  const {
    response,
    data: server,
    loading,
    error,
  } = useFetch<Server>(
    route(`/servers/${serverName}`),
    { cachePolicy: CachePolicies.NO_CACHE },
    [serverName]
  );

  useEffect(() => {
    if (server && !error && !loading) {
      serverStore.setState({ server: server });
      return () => serverStore.setState({ server: null });
    }
  }, [server, error, loading]);

  if (response.status === 404) {
    return <Redirect to="/" />;
  }

  if (error) {
    return (
      <div className="p-2 border border-red-400 bg-red-100 text-red-400">
        Error: {error.toString()}
      </div>
    );
  }

  if (loading) {
    return (
      <BiLoader className="h-6 w-6 text-blue-400 animate-spin my-auto mx-auto" />
    );
  }

  let dcsMap: DCSMap | null = null;	
  if (server && server.map === "Caucasus") {
    dcsMap = Caucasus;
  } else if (server && server.map === "Sinai") {
    dcsMap = Sinai;
  } else if (server && server.map === "SinaiMap") {
    dcsMap = Sinai;
  } else if (server && server.map === "Syria") {
    dcsMap = Syria;
  } else if (server && server.map === "PersianGulf") {
    dcsMap = PersianGulf;
  } else if (server && server.map === "Marianas") {
    dcsMap = Marianas;
  } else if (server && server.map === "Falklands") {
    dcsMap = Falklands;
  } else if (server && server.map === "Normandy") {
    dcsMap = Normandy;
  } else if (server && server.map === "Nevada") {
    dcsMap = Nevada;
  } else if (server && server.map === "Kola") {
    dcsMap = Kola;
  } else if (server && server.map === "Afghanistan") {
    dcsMap = Afghanistan;
  } else if (server && server.map === "GermanyCW") {
    dcsMap = GermanyCW;
  } else {
    dcsMap = Caucasus;
  }

  return (
    <div className="relative w-full h-full">
      <Map dcsMap={dcsMap} />
      {backendMaintenance && (
        <div className="absolute inset-0 z-50 bg-gray-900/80 flex items-center justify-center">
          <div className="max-w-lg mx-4 p-6 rounded-md border border-yellow-600 bg-gray-800 text-yellow-100">
            <div className="text-2xl font-semibold mb-2">Maintenance in progress</div>
            <div className="text-sm opacity-90">
              The DCSBattleground server is temporarily unavailable.
              Automatic reconnection in progress...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <div className="bg-gray-700 max-w-full max-h-full w-full h-full">
      <Switch>
        <Route exact path="/" component={ServerConnectModal} />
        <Route
          exact
          path="/servers/:serverName"
          render={({
            match: {
              params: { serverName },
            },
          }) => {
            return <ServerContainer serverName={serverName} />;
          }}
        />
      </Switch>
    </div>
  );
}

export default App;
