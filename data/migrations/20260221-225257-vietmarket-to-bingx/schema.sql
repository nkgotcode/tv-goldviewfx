--
-- PostgreSQL database dump
--

\restrict fMlnVNgPnFpW2p2vz7MX4nBZuDuONbVsct8d05xQXi29CGhIXbQ3Pu9i7IXhdnJ

-- Dumped from database version 16.11 (Ubuntu 16.11-1.pgdg22.04+1)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bingx_candles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_candles (
    pair text NOT NULL,
    "interval" text NOT NULL,
    open_time timestamp with time zone NOT NULL,
    close_time timestamp with time zone NOT NULL,
    open double precision NOT NULL,
    high double precision NOT NULL,
    low double precision NOT NULL,
    close double precision NOT NULL,
    volume double precision NOT NULL,
    quote_volume double precision,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_orderbook_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_orderbook_snapshots (
    pair text NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    depth_level integer NOT NULL,
    bids jsonb NOT NULL,
    asks jsonb NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_funding_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_funding_rates (
    pair text NOT NULL,
    funding_rate double precision NOT NULL,
    funding_time timestamp with time zone NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_open_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_open_interest (
    pair text NOT NULL,
    open_interest double precision NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_mark_index_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_mark_index_prices (
    pair text NOT NULL,
    mark_price double precision NOT NULL,
    index_price double precision NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_tickers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_tickers (
    pair text NOT NULL,
    last_price double precision NOT NULL,
    volume_24h double precision,
    price_change_24h double precision,
    captured_at timestamp with time zone NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bingx_trades (
    pair text NOT NULL,
    trade_id text NOT NULL,
    price double precision NOT NULL,
    quantity double precision NOT NULL,
    side text NOT NULL,
    executed_at timestamp with time zone NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bingx_candles bingx_candles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_candles
    ADD CONSTRAINT bingx_candles_pkey PRIMARY KEY (pair, "interval", open_time);


--
-- Name: bingx_funding_rates bingx_funding_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_funding_rates
    ADD CONSTRAINT bingx_funding_rates_pkey PRIMARY KEY (pair, funding_time);


--
-- Name: bingx_mark_index_prices bingx_mark_index_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_mark_index_prices
    ADD CONSTRAINT bingx_mark_index_prices_pkey PRIMARY KEY (pair, captured_at);


--
-- Name: bingx_open_interest bingx_open_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_open_interest
    ADD CONSTRAINT bingx_open_interest_pkey PRIMARY KEY (pair, captured_at);


--
-- Name: bingx_orderbook_snapshots bingx_orderbook_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_orderbook_snapshots
    ADD CONSTRAINT bingx_orderbook_snapshots_pkey PRIMARY KEY (pair, captured_at, depth_level);


--
-- Name: bingx_tickers bingx_tickers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_tickers
    ADD CONSTRAINT bingx_tickers_pkey PRIMARY KEY (pair, captured_at);


--
-- Name: bingx_trades bingx_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bingx_trades
    ADD CONSTRAINT bingx_trades_pkey PRIMARY KEY (pair, trade_id);


--
-- Name: bingx_candles_open_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_candles_open_time_idx ON public.bingx_candles USING btree (open_time DESC);


--
-- Name: bingx_funding_rates_funding_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_funding_rates_funding_time_idx ON public.bingx_funding_rates USING btree (funding_time DESC);


--
-- Name: bingx_mark_index_prices_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_mark_index_prices_captured_at_idx ON public.bingx_mark_index_prices USING btree (captured_at DESC);


--
-- Name: bingx_open_interest_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_open_interest_captured_at_idx ON public.bingx_open_interest USING btree (captured_at DESC);


--
-- Name: bingx_orderbook_snapshots_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_orderbook_snapshots_captured_at_idx ON public.bingx_orderbook_snapshots USING btree (captured_at DESC);


--
-- Name: bingx_tickers_captured_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bingx_tickers_captured_at_idx ON public.bingx_tickers USING btree (captured_at DESC);


--
-- Name: idx_bingx_candles_pair_interval_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_candles_pair_interval_time ON public.bingx_candles USING btree (pair, "interval", open_time DESC);


--
-- Name: idx_bingx_funding_pair_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_funding_pair_time ON public.bingx_funding_rates USING btree (pair, funding_time DESC);


--
-- Name: idx_bingx_mark_index_pair_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_mark_index_pair_time ON public.bingx_mark_index_prices USING btree (pair, captured_at DESC);


--
-- Name: idx_bingx_open_interest_pair_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_open_interest_pair_time ON public.bingx_open_interest USING btree (pair, captured_at DESC);


--
-- Name: idx_bingx_orderbook_pair_captured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_orderbook_pair_captured ON public.bingx_orderbook_snapshots USING btree (pair, captured_at DESC);


--
-- Name: idx_bingx_tickers_pair_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_tickers_pair_time ON public.bingx_tickers USING btree (pair, captured_at DESC);


--
-- Name: idx_bingx_trades_pair_exec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bingx_trades_pair_exec ON public.bingx_trades USING btree (pair, executed_at DESC);


--
-- PostgreSQL database dump complete
--

\unrestrict fMlnVNgPnFpW2p2vz7MX4nBZuDuONbVsct8d05xQXi29CGhIXbQ3Pu9i7IXhdnJ

