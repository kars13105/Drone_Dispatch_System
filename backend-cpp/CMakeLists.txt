cmake_minimum_required(VERSION 3.16)
project(drone-dispatch-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Header-only libs
include_directories(${CMAKE_SOURCE_DIR}/include)

# Main executable
add_executable(drone_dispatch
    src/main.cpp
)

# Link pthreads (required by httplib)
find_package(Threads REQUIRED)
target_link_libraries(drone_dispatch Threads::Threads)

# macOS: no extra deps needed for httplib without SSL
