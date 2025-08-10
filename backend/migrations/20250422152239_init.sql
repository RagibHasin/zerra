-- Create users table.
create table if not exists users
(
    id int8 primary key not null,
    username text not null unique,
    auth_hash text not null,
    display_name text not null,
    is_male boolean not null
);

-- Insert "Tester" user.
insert into users (id, username, auth_hash, display_name, is_male)
values (1, 'Tester', '$argon2i$v=19$m=16,t=2,p=1$ZVVwWEdlOGhaWWtHY2pmSg$Cz9mMiG9rXXYyL+P7kymGQ', 'Tester', true);

-- Create vus table.
create table if not exists vus
(
    id text primary key not null,
    owner int8 not null,
    data bytea not null,
    last_modified int8 not null
);
