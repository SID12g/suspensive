'use client'

// https://github.com/TanStack/query/blob/main/packages/react-query-next-experimental/src/ReactQueryStreamedHydration.tsx
import {
  type DehydrateOptions,
  type DehydratedState,
  type HydrateOptions,
  type QueryClient,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  isServer,
  useQueryClient,
} from '@tanstack/react-query'
import * as React from 'react'
import { type HydrationStreamProviderProps, createHydrationStreamProvider } from './HydrationStreamProvider'

const stream = createHydrationStreamProvider<DehydratedState>()

/**
 * This component is responsible for:
 * - hydrating the query client on the server
 * - dehydrating the query client on the server
 */
export function ReactQueryStreamedHydration(props: {
  children: React.ReactNode
  queryClient?: QueryClient
  nonce?: string
  options?: {
    hydrate?: HydrateOptions
    dehydrate?: DehydrateOptions
  }
  transformer?: HydrationStreamProviderProps<DehydratedState>['transformer']
}) {
  const defaultClient = useQueryClient()
  const queryClient = props.queryClient ?? defaultClient

  /**
   * We need to track which queries were added/updated during the render
   */
  const [trackedKeys] = React.useState(() => new Set<string>())

  // <server only>
  if (isServer) {
    // Do we need to care about unsubscribing? I don't think so to be honest
    queryClient.getQueryCache().subscribe((event) => {
      switch (event.type) {
        case 'added':
        case 'updated':
          // console.log('tracking', event.query.queryHash, 'b/c of a', event.type)
          trackedKeys.add(event.query.queryHash)
      }
    })
  }
  // </server only>

  return (
    <stream.Provider
      // Happens on server:
      onFlush={() => {
        /**
         * Dehydrated state of the client where we only include the queries that were added/updated since the last flush
         */
        const shouldDehydrate = props.options?.dehydrate?.shouldDehydrateQuery ?? defaultShouldDehydrateQuery

        const dehydratedState = dehydrate(queryClient, {
          ...props.options?.dehydrate,
          shouldDehydrateQuery(query) {
            return trackedKeys.has(query.queryHash) && shouldDehydrate(query)
          },
        })
        trackedKeys.clear()

        if (!dehydratedState.queries.length) {
          return []
        }

        return [dehydratedState]
      }}
      // Happens in browser:
      onEntries={(entries) => {
        for (const hydratedState of entries) {
          hydrate(queryClient, hydratedState, props.options?.hydrate)
        }
      }}
      // Handle BigInts etc using superjson
      transformer={props.transformer}
      nonce={props.nonce}
    >
      {props.children}
    </stream.Provider>
  )
}
